import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { UploadCloud, FileText, Sparkles, Trash2 } from "lucide-react";
import { announceDeletedItem, REFRESH_EVENT } from "../lib/uiEvents";
import type { FileSummary, Flashcard } from "../lib/contracts";

export default function Library() {
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentCard, setCurrentCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [sourceNote, setSourceNote] = useState("");

  const loadFiles = () => api.getFiles().then(setFiles).catch((error) => setErrorMsg(error instanceof Error ? error.message : "Could not load documents."));
  useEffect(() => { void loadFiles(); }, []);
  useEffect(() => {
    const refresh = () => { void loadFiles(); };
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => window.removeEventListener(REFRESH_EVENT, refresh);
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const picked = Array.from(e.target.files);
    const totalBytes = picked.reduce((sum, file) => sum + file.size, 0);
    setErrorMsg(""); setSuccessMsg("");
    if (picked.length === 0) return;
    if (picked.length > 5) { setErrorMsg("Choose up to five files at a time."); e.target.value = ""; return; }
    if (totalBytes > 20 * 1024 * 1024) { setErrorMsg("Keep each upload batch under 20 MB."); e.target.value = ""; return; }
    setIsUploading(true);
    try {
      const result = await api.uploadFiles(picked);
      await loadFiles();
      setSuccessMsg(result.notices?.length ? result.notices.join(" ") : `${result.files.length} ${result.files.length === 1 ? "document" : "documents"} added to your library.`);
    } catch (uploadError) {
      setErrorMsg(uploadError instanceof Error ? uploadError.message : "Could not upload this file.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: number) => {
    const file = files.find((item) => item.id === id);
    try {
      await api.deleteFile(id);
      setFiles((current) => current.filter((item) => item.id !== id));
      if (file) announceDeletedItem({ kind: "file", id, label: file.filename });
    } catch (deleteError) {
      setErrorMsg(deleteError instanceof Error ? deleteError.message : "Could not delete this file.");
    }
  };

  const generate = async () => {
    setIsGenerating(true); setErrorMsg(""); setCurrentCard(0); setIsFlipped(false);
    try {
      const res = await api.generateFlashcards();
      if (res.flashcards) setFlashcards(res.flashcards);
      setSourceNote(res.source_note || "");
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : "Could not generate flashcards."); } finally { setIsGenerating(false); }
  };

  return (
    <div className="px-4 py-5 pb-safe md:p-10 max-w-6xl mx-auto space-y-6 md:space-y-8">
      <header className="border-b border-gray-200 pb-6"><h1 className="text-3xl font-black tracking-tight">Library & Study</h1></header>

      <div className="bg-white border-2 border-dashed border-gray-300 rounded-3xl p-6 md:p-10 text-center hover:border-[#7C3AED] transition-colors">
        <UploadCloud size={40} className="text-[#7C3AED] mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900">Keep your study material close</h2>
        <p className="mt-1 mb-5 text-sm text-gray-500">PDF, images, Excel, or CSV · up to 5 files and 20 MB per batch · bounded extraction for safe study</p>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,application/pdf,image/png,image/jpeg,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" multiple onChange={handleUpload} className="sr-only" id="file-upload" disabled={isUploading} />
        <label htmlFor="file-upload" aria-disabled={isUploading} className={`inline-flex min-h-11 items-center justify-center cursor-pointer bg-gray-900 text-white text-sm font-bold px-8 py-3 rounded-xl hover:bg-black transition-all ${isUploading ? "pointer-events-none opacity-60" : ""}`}>{isUploading ? "Adding documents…" : "Choose documents"}</label>
        {errorMsg && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMsg}</p>}
        {successMsg && <p role="status" className="mt-4 rounded-xl bg-violet-50 p-3 text-sm font-medium text-violet-800">{successMsg}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-gray-500">Documents ({files.length})</h3>
          {files.map(f => (
            <div key={f.id} className="flex min-w-0 items-center justify-between gap-3 p-3 md:p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="flex min-w-0 items-center gap-3"><FileText className="shrink-0 text-[#7C3AED]" size={20} /><span className="truncate text-sm font-bold text-gray-800">{f.filename}</span></div>
              <button aria-label={`Delete ${f.filename}`} onClick={() => handleDelete(f.id)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={20} /></button>
            </div>
          ))}
          {files.length === 0 && <p className="rounded-2xl border border-dashed border-gray-200 p-5 text-sm text-gray-500">Your documents will appear here after upload.</p>}
        </div>

        <div className="bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] rounded-3xl p-1 shadow-xl min-h-[430px] lg:h-[500px]">
          <div className="bg-white rounded-[1.4rem] h-full flex flex-col p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-lg md:text-xl flex items-center gap-2"><Sparkles className="shrink-0 text-[#7C3AED]" size={22} /> Flashcards</h3>
              <button onClick={generate} disabled={isGenerating || files.length === 0} className="min-h-11 bg-[#7C3AED] text-white text-sm font-bold px-4 md:px-6 py-2 rounded-xl disabled:opacity-50">{isGenerating ? "Generating…" : "Generate deck"}</button>
            </div>
            {sourceNote && <p role="status" className="mb-3 text-xs text-gray-500">{sourceNote}</p>}
            <div className="flex-1 flex items-center justify-center perspective-1000">
              {isGenerating ? (
                <div className="text-[#7C3AED] animate-pulse font-bold">Creating cards...</div>
              ) : flashcards.length > 0 && flashcards[currentCard] ? (
                <div onClick={() => setIsFlipped(!isFlipped)} className={`relative w-full max-w-sm h-64 cursor-pointer transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
                  <div className="absolute inset-0 bg-[#F2F2F7] rounded-3xl border-4 border-[#7C3AED] flex flex-col items-center justify-center p-8 backface-hidden"><span className="text-xs font-bold text-gray-400 mb-4">Q {currentCard + 1}</span><p className="text-xl font-black text-center">{flashcards[currentCard].q}</p></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] rounded-3xl flex flex-col items-center justify-center p-8 rotate-y-180 backface-hidden"><span className="text-xs font-bold text-violet-200 mb-4">ANSWER</span><p className="text-lg font-medium text-center text-white">{flashcards[currentCard].a}</p></div>
                </div>
              ) : <p className="text-gray-400">No flashcards loaded.</p>}
            </div>
            {flashcards.length > 0 && <button onClick={() => { setIsFlipped(false); setCurrentCard(prev => Math.min(prev + 1, flashcards.length - 1)); }} className="mt-6 min-h-11 bg-gray-900 text-white font-bold py-3 rounded-xl">Next card</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
