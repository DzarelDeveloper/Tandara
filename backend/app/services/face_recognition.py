class FaceRecognitionService:
    """Contract for a local face engine. No identity is fabricated when no engine is configured."""
    def register_face(self, student_id, images): raise RuntimeError('NOT_CONFIGURED: Mesin pengenalan wajah belum dikonfigurasi.')
    def delete_face(self, student_id): raise RuntimeError('NOT_CONFIGURED: Mesin pengenalan wajah belum dikonfigurasi.')
    def identify_face(self, frame): return {'status':'NOT_CONFIGURED','message':'Mesin pengenalan wajah belum dikonfigurasi.'}
    def validate_face_quality(self, image): return {'valid':False,'code':'NOT_CONFIGURED','message':'Mesin pengenalan wajah belum dikonfigurasi.'}
