/**
 * Tandara LeaveReviewDrawer
 * Drawer for inspecting parent leave requests (sakit/izin) and approving/rejecting.
 */

import React, { useState } from 'react';
import { Drawer } from '../ui/Drawer';
import { useToast } from '../../context/ToastContext';
import { LeaveRequest } from '../../types';
import { User, FileText, Check, X, AlertCircle } from 'lucide-react';

interface LeaveReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  leaveRequest: LeaveRequest | null;
}

export const LeaveReviewDrawer: React.FC<LeaveReviewDrawerProps> = ({
  isOpen,
  onClose,
  leaveRequest,
}) => {
  const { showBackendNotConnected } = useToast();
  const [reviewNote, setReviewNote] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const handleApprove = () => {
    showBackendNotConnected('Backend belum terhubung. Persetujuan izin belum dapat disimpan ke server.');
    onClose();
  };

  const handleReject = () => {
    if (!rejectMode) {
      setRejectMode(true);
      return;
    }

    if (!rejectReason.trim()) {
      setRejectError('Alasan penolakan wajib diisi untuk menginformasikan orang tua.');
      return;
    }

    showBackendNotConnected('Backend belum terhubung. Penolakan permohonan izin belum dapat disimpan.');
    onClose();
  };

  if (!leaveRequest) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Tinjau Permohonan Izin / Sakit"
      subtitle="Verifikasi surat izin dari aplikasi orang tua siswa"
      width="md"
    >
      <div className="space-y-5">
        {/* Siswa & Orang Tua Info */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm">
              <User className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">{leaveRequest.studentName}</h4>
              <p className="text-xs text-slate-500">
                NIS: {leaveRequest.nis} | Kelas: {leaveRequest.className}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/80 text-xs text-slate-600">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Pengaju (Wali Murid)</span>
            <span className="font-medium text-slate-800">{leaveRequest.parentName}</span>
          </div>
        </div>

        {/* Tipe & Periode Tanggal */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Tipe Permohonan</span>
            <span className="font-semibold text-slate-900 mt-0.5 block">{leaveRequest.leaveType}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Periode</span>
            <span className="font-medium text-slate-800 mt-0.5 block font-mono">
              {leaveRequest.startDate} s/d {leaveRequest.endDate}
            </span>
          </div>
        </div>

        {/* Alasan */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Alasan dari Orang Tua
          </label>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed">
            {leaveRequest.reason || 'Tidak ada keterangan tambahan.'}
          </div>
        </div>

        {/* Bukti Dokumen Placeholder */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Lampiran / Surat Keterangan Dokter
          </label>
          <div className="p-4 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center gap-2 text-xs text-slate-500">
            <FileText className="w-4 h-4 text-slate-400" />
            <span>Tidak ada lampiran dokumen.</span>
          </div>
        </div>

        {/* Catatan Reviewer */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Catatan Petugas Piket (Opsional)
          </label>
          <textarea
            rows={2}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Tambahkan catatan tindak lanjut..."
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Rejection input field if reject mode activated */}
        {rejectMode && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
            <label className="block text-xs font-semibold text-red-900 uppercase">
              Alasan Penolakan <span className="text-red-600">*</span>
            </label>
            <textarea
              rows={2}
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setRejectError('');
              }}
              placeholder="Jelaskan alasan penolakan untuk dikirimkan ke aplikasi orang tua..."
              className="w-full px-3 py-2 text-xs bg-white border border-red-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {rejectError && <p className="text-xs text-red-700 font-medium">{rejectError}</p>}
          </div>
        )}

        {/* Reminder that notification will be sent to Parent App */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span>
            Keputusan persetujuan atau penolakan akan dikirimkan secara langsung ke <strong>aplikasi orang tua</strong> pemohon.
          </span>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleReject}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            {rejectMode ? 'Konfirmasi Tolak' : 'Tolak Izin'}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#15803D] hover:bg-[#166534] rounded-lg shadow-xs transition-colors"
          >
            <Check className="w-4 h-4" />
            Setujui Permohonan
          </button>
        </div>
      </div>
    </Drawer>
  );
};
