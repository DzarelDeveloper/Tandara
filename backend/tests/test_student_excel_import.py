import io
import json

from openpyxl import Workbook
from sqlalchemy import select

from app.database import SessionLocal
from app.models import AuditLog, Student


def workbook_bytes(headers, rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def upload(file_bytes, filename='siswa.xlsx', content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'):
    return {'file': (filename, file_bytes, content_type)}


def test_excel_import_many_rows_maps_aliases_and_commits_once(client, headers, classroom):
    rows = [[f'NIS-{number:04}', f'Siswa {number}', 'XII-Test', 'IPA', 'L'] for number in range(1, 81)]
    file_bytes = workbook_bytes(
        ['NISN', 'Nama Lengkap', 'Rombel', 'Program Keahlian', 'Jenis Kelamin'],
        rows,
    )

    preview = client.post('/api/students/import/preview', headers=headers['admin'], files=upload(file_bytes))
    assert preview.status_code == 200
    data = preview.json()['data']
    assert data['total_rows'] == 80
    assert data['valid_rows'] == 80
    assert data['mapping_required'] is False

    imported = client.post('/api/students/import', headers=headers['admin'], files=upload(file_bytes))
    assert imported.status_code == 200
    assert imported.json()['data']['imported_count'] == 80
    assert imported.json()['data']['skipped_count'] == 0

    with SessionLocal() as db:
        assert db.scalar(select(Student).where(Student.nis == 'NIS-0080')).full_name == 'Siswa 80'
        assert db.query(Student).count() == 80
        assert db.query(AuditLog).filter_by(action='IMPORT', entity_type='Student').count() == 1


def test_unknown_headers_allow_manual_mapping_before_import(client, headers, classroom):
    file_bytes = workbook_bytes(
        ['Nomor Identitas', 'Nama di Sekolah', 'Rombongan'],
        [['MANUAL-1', 'Siswa Manual', 'XII-Test']],
    )
    preview = client.post('/api/students/import/preview', headers=headers['admin'], files=upload(file_bytes))
    assert preview.status_code == 200
    data = preview.json()['data']
    assert data['mapping_required'] is True
    assert [column['label'] for column in data['headers']] == ['Nomor Identitas', 'Nama di Sekolah', 'Rombongan']
    assert data['valid_rows'] == 0

    mapping = {'nis': 0, 'full_name': 1, 'class_name': 2}
    form = {'mapping': json.dumps(mapping)}
    validated = client.post('/api/students/import/preview', headers=headers['admin'], data=form, files=upload(file_bytes))
    assert validated.status_code == 200
    assert validated.json()['data']['valid_rows'] == 1
    imported = client.post('/api/students/import', headers=headers['admin'], data=form, files=upload(file_bytes))
    assert imported.status_code == 200
    assert imported.json()['data']['imported_count'] == 1


def test_duplicates_invalid_rows_and_skip_policy(client, headers, classroom, student):
    file_bytes = workbook_bytes(
        ['NIS', 'Nama Siswa', 'Kelas'],
        [
            ['TEST-001', 'Sudah Ada', 'XII-Test'],
            ['NEW-001', 'Siswa Baru', 'XII-Test'],
            ['NEW-001', 'Duplikat Dalam File', 'XII-Test'],
            ['NEW-002', '', 'XII-Test'],
        ],
    )
    imported = client.post('/api/students/import', headers=headers['admin'], files=upload(file_bytes))
    assert imported.status_code == 200
    data = imported.json()['data']
    assert data['imported_count'] == 1
    assert data['skipped_count'] == 2
    assert data['failed_count'] == 1
    assert [row['status'] for row in data['rows']] == ['duplicate', 'valid', 'duplicate', 'invalid']
    assert data['rows'][3]['row_number'] == 5
    assert any('Nama siswa minimal' in item['message'] for item in data['rows'][3]['errors'])
    with SessionLocal() as db:
        assert db.query(Student).count() == 2


def test_required_fields_class_and_gender_are_validated_with_row_numbers(client, headers, classroom):
    file_bytes = workbook_bytes(
        ['NIS', 'Nama Siswa', 'Kelas', 'Jurusan', 'Jenis Kelamin'],
        [
            ['', 'Siswa Kosong NIS', 'XII-Test', 'IPA', 'L'],
            ['BAD-CLASS', 'Siswa Kelas', 'Tidak Ada', 'IPA', 'P'],
            ['BAD-GENDER', 'Siswa Gender', 'XII-Test', 'IPA', 'X'],
        ],
    )
    response = client.post('/api/students/import/preview', headers=headers['admin'], files=upload(file_bytes))
    assert response.status_code == 200
    rows = response.json()['data']['rows']
    assert [row['row_number'] for row in rows] == [2, 3, 4]
    assert [[item['field'] for item in row['errors']] for row in rows] == [
        ['nis'],
        ['class_name'],
        ['gender'],
    ]
    assert response.json()['data']['invalid_rows'] == 3


def test_abort_duplicate_policy_writes_nothing(client, headers, classroom, student):
    file_bytes = workbook_bytes(
        ['NIS', 'Nama', 'Kelas'],
        [['TEST-001', 'Existing', 'XII-Test'], ['NEW-002', 'Siswa Baru', 'XII-Test']],
    )
    response = client.post(
        '/api/students/import',
        headers=headers['admin'],
        data={'duplicate_policy': 'abort'},
        files=upload(file_bytes),
    )
    assert response.status_code == 409
    assert response.json()['code'] == 'IMPORT_DUPLICATES_FOUND'
    with SessionLocal() as db:
        assert db.query(Student).count() == 1


def test_empty_invalid_and_oversized_row_count_are_rejected(client, headers):
    empty = client.post('/api/students/import/preview', headers=headers['admin'], files=upload(b'', 'empty.csv', 'text/csv'))
    assert empty.status_code == 422
    invalid_excel = client.post('/api/students/import/preview', headers=headers['admin'], files=upload(b'not an xlsx'))
    assert invalid_excel.status_code == 422

    too_many = workbook_bytes(
        ['NIS', 'Nama', 'Kelas'],
        [[f'N-{row}', f'Siswa {row}', 'Kelas'] for row in range(2001)],
    )
    response = client.post('/api/students/import/preview', headers=headers['admin'], files=upload(too_many))
    assert response.status_code == 422
    assert response.json()['code'] == 'IMPORT_TOO_MANY_ROWS'


def test_only_admin_can_preview_or_import(client, headers, classroom):
    file_bytes = workbook_bytes(['NIS', 'Nama', 'Kelas'], [['NEW-1', 'Siswa', 'XII-Test']])
    assert client.post('/api/students/import/preview', headers=headers['guru'], files=upload(file_bytes)).status_code == 403
    assert client.post('/api/students/import', headers=headers['guru'], files=upload(file_bytes)).status_code == 403
    assert client.post('/api/students/import/preview', files=upload(file_bytes)).status_code == 401
    assert client.post('/api/students/import', files=upload(file_bytes)).status_code == 401


def test_csv_works_without_parent_fields(client, headers, classroom):
    raw = 'NISN,Nama Lengkap,Kelas,Jurusan\nCSV-1,Siswa CSV,XII-Test,IPA\n'
    response = client.post(
        '/api/students/import',
        headers=headers['admin'],
        files=upload(raw.encode(), 'siswa.csv', 'text/csv'),
    )
    assert response.status_code == 200
    assert response.json()['data']['imported_count'] == 1
    with SessionLocal() as db:
        row = db.scalar(select(Student).where(Student.nis == 'CSV-1'))
        assert row is not None and row.gender is None and row.guardian_id is None
