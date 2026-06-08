import { useState, useRef, useEffect } from "react"
import axios from "axios"
import ReactMarkdown from "react-markdown"

const API = "http://127.0.0.1:8000"

export default function App() {
  const [subject, setSubject] = useState("")
  const [subjects, setSubjects] = useState([])
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState("")
  const [marks, setMarks] = useState(5)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState("")
  const [uploadOk, setUploadOk] = useState(false)
  const [activeFile, setActiveFile] = useState("")
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [noSubjectWarning, setNoSubjectWarning] = useState(false)
  const [resourceType, setResourceType] = useState("notes")
  const [sessionId] = useState("session-" + Date.now())
  const [retryParams, setRetryParams] = useState(null)
  const [lastRetryableMessageIndex, setLastRetryableMessageIndex] = useState(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    axios.get(`${API}/subjects`).then(r => setSubjects(r.data.subjects)).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px"
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
    }
  }, [question])

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file || !subject.trim()) {
      setUploadOk(false)
      setUploadMsg("Enter a subject name first.")
      return
    }
    setUploading(true)
    setUploadProgress(0)
    setUploadMsg("")
    setUploadOk(false)
    const form = new FormData()
    form.append("file", file)
    form.append("subject", subject)
    form.append("resource_type", resourceType)
    
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + Math.random() * 25, 95))
    }, 800)
    
    try {
      const r = await axios.post(`${API}/ingest`, form)
      clearInterval(progressInterval)
      setUploadProgress(100)
      setUploadOk(true)
      setUploadMsg(`✓ ${r.data.chunks_stored} chunks stored · ${resourceType.toUpperCase()}`)
      setSubjects(prev => [...new Set([...prev, subject])])
      setActiveFile(file.name)
    } catch (error) {
      clearInterval(progressInterval)
      setUploadProgress(0)
      setUploadOk(false)
      const msg = error?.response?.data?.detail || error?.message
      setUploadMsg(msg || "Upload failed. Check if the PDF has selectable text.")
    } finally {
      setUploading(false)
      setTimeout(() => setUploadProgress(0), 500)
      e.target.value = ""
    }
  }

  async function handleSend() {
    if (!question.trim()) return
    
    if (!subject.trim()) {
      setNoSubjectWarning(true)
      setTimeout(() => setNoSubjectWarning(false), 3500)
      return
    }
    
    const userMsg = { role: "user", content: question }
    setMessages(prev => [...prev, userMsg])
    setQuestion("")
    setLoading(true)
    
    // Store retry parameters in case of 503 error
    const queryParams = {
      question: question,
      subject: subject || null,
      marks,
      resource_type: resourceType
    }
    setRetryParams(queryParams)
    
    try {
      const r = await axios.post(`${API}/chat`, {
        ...queryParams,
        session_id: sessionId
      })
      setMessages(prev => [...prev, {
        role: "assistant",
        content: r.data.answer,
        sources: r.data.sources
      }])
      setRetryParams(null)
    } catch (error) {
      const serverMessage = error?.response?.data?.detail || error?.message
      const is503 = error?.response?.status === 503
      const msgIndex = messages.length + 1 // +1 for the user message we just added
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: serverMessage || "Could not reach the backend. Make sure it's running.",
        isRetryable: is503
      }])
      
      if (is503) {
        setLastRetryableMessageIndex(msgIndex)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRetry() {
    if (!retryParams) return
    
    setMessages(prev => {
      const updated = [...prev]
      if (lastRetryableMessageIndex !== null) {
        updated[lastRetryableMessageIndex].isRetryable = false
      }
      return updated
    })
    
    setLoading(true)
    try {
      const r = await axios.post(`${API}/chat`, {
        ...retryParams,
        session_id: sessionId
      })
      setMessages(prev => [...prev, {
        role: "assistant",
        content: r.data.answer,
        sources: r.data.sources
      }])
      setRetryParams(null)
      setLastRetryableMessageIndex(null)
    } catch (error) {
      const serverMessage = error?.response?.data?.detail || error?.message
      const is503 = error?.response?.status === 503
      const msgIndex = messages.length
      
      setMessages(prev => [...prev, {
        role: "assistant",
        content: serverMessage || "Could not reach the backend. Make sure it's running.",
        isRetryable: is503
      }])
      
      if (is503) {
        setLastRetryableMessageIndex(msgIndex)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  async function copyToClipboard(text, index) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      window.setTimeout(() => setCopiedIndex(null), 1500)
    } catch { console.warn("Copy failed") }
  }

  const marksLabel = marks <= 2 ? "Short" : marks <= 5 ? "Medium" : "Detailed"

  const resourceTypes = [
    { value: "notes", label: "Notes" },
    { value: "pyq", label: "PYQ" },
    { value: "imp", label: "IMP" },
    { value: "questionbank", label: "Q-Bank" },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-space: #030014;
          --bg-sidebar: rgba(6, 4, 18, 0.7);
          --bg-card: rgba(13, 9, 33, 0.45);
          --bg-input: rgba(15, 12, 38, 0.5);
          --accent-purple: #a855f7;
          --accent-purple-dim: rgba(168, 85, 247, 0.12);
          --accent-glow: rgba(168, 85, 247, 0.4);
          --border-subtle: rgba(168, 85, 247, 0.15);
          --border-dim: rgba(255, 255, 255, 0.05);
          --border-bright: rgba(255, 255, 255, 0.12);
          --text-primary: #f8fafc;
          --text-secondary: #94a3b8;
          --text-muted: #64748b;
          --glass-blur: blur(24px);
        }

        html, body, #root {
          height: 100%;
          background: var(--bg-space);
          color: var(--text-primary);
          overflow: hidden;
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .ambient-orbs { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .orb-top-left { position: absolute; width: 800px; height: 800px; background: radial-gradient(circle, rgba(147,51,234,0.15) 0%, transparent 65%); top: -350px; left: -250px; border-radius: 50%; }
        .orb-bottom-right { position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%); bottom: -200px; right: -100px; border-radius: 50%; }
        .bg-grid-overlay { position: absolute; inset: 0; background-image: radial-gradient(rgba(168,85,247,0.06) 1.2px, transparent 1.2px); background-size: 32px 32px; opacity: 0.85; }

        .layout { position: relative; z-index: 2; display: flex; flex-direction: column; height: 100vh; }

        .header { display: flex; align-items: center; justify-content: space-between; padding: 0 32px; height: 68px; border-bottom: 1px solid var(--border-dim); background: rgba(4,2,14,0.65); backdrop-filter: var(--glass-blur); flex-shrink: 0; }
        .header-brand { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .header-logo-container { position: relative; display: flex; align-items: center; justify-content: center; }
        .header-logo-glow { position: absolute; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-purple); filter: blur(8px); opacity: 0.6; animation: logo-glow-pulse 4s ease-in-out infinite alternate; }
        @keyframes logo-glow-pulse { 0% { transform: scale(0.9); opacity: 0.4; } 100% { transform: scale(1.15); opacity: 0.7; } }
        .brand-text { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: -0.02em; background: linear-gradient(135deg, #ffffff 40%, #c084fc 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .brand-text span { color: var(--accent-purple); -webkit-text-fill-color: initial; }
        .header-right { display: flex; align-items: center; gap: 16px; }
        .status-pill { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-dim); padding: 6px 14px; border-radius: 30px; font-size: 11px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.05em; font-family: 'Space Grotesk', sans-serif; }
        .status-dot-pulse { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px rgba(16,185,129,0.6); position: relative; }
        .status-dot-pulse::after { content: ''; position: absolute; inset: -2px; border-radius: 50%; border: 2px solid #10b981; animation: status-pulse 1.8s cubic-bezier(0.24,0,0.38,1) infinite; }
        @keyframes status-pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.4); opacity: 0; } }

        .body { display: flex; flex: 1; overflow: hidden; }

        .sidebar { width: 290px; flex-shrink: 0; border-right: 1px solid var(--border-dim); background: var(--bg-sidebar); backdrop-filter: var(--glass-blur); padding: 28px 24px; display: flex; flex-direction: column; gap: 28px; overflow-y: auto; }
        .sidebar::-webkit-scrollbar { width: 4px; }
        .sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .sidebar-section { display: flex; flex-direction: column; gap: 10px; }
        .section-header { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
        .section-icon { width: 14px; height: 14px; color: var(--accent-purple); }

        .field-container { position: relative; }
        .field-input { width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px 14px 12px 38px; font-size: 13.5px; font-family: inherit; color: var(--text-primary); outline: none; transition: all 0.3s cubic-bezier(0.16,1,0.3,1); }
        .field-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; color: var(--text-muted); pointer-events: none; }
        .field-input:focus { border-color: var(--accent-purple); background: rgba(168,85,247,0.06); box-shadow: 0 0 0 3px rgba(168,85,247,0.15); }
        .field-input::placeholder { color: var(--text-muted); }

        /* Resource type selector */
        .resource-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .resource-btn { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border-dim); background: rgba(255,255,255,0.02); color: var(--text-muted); font-size: 11px; font-weight: 600; font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; text-align: center; }
        .resource-btn:hover { border-color: var(--border-subtle); color: var(--text-secondary); }
        .resource-btn.active { background: var(--accent-purple-dim); border-color: var(--accent-purple); color: #fff; box-shadow: 0 0 10px rgba(168,85,247,0.2); }

        .marks-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .marks-val { font-size: 12px; font-family: 'Space Grotesk', sans-serif; font-weight: 600; color: var(--accent-purple); background: var(--accent-purple-dim); padding: 2px 8px; border-radius: 6px; }
        .slider-wrapper { position: relative; padding: 8px 0; }
        input[type=range] { width: 100%; appearance: none; height: 5px; background: rgba(255,255,255,0.08); border-radius: 6px; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #ffffff; border: 3px solid var(--accent-purple); box-shadow: 0 0 12px var(--accent-purple); cursor: pointer; transition: transform 0.2s; }
        input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.3); background: var(--accent-purple); border-color: #ffffff; }

        .upload-card { display: block; width: 100%; border: 1.5px dashed var(--border-subtle); border-radius: 12px; padding: 24px 16px; text-align: center; cursor: pointer; background: rgba(168,85,247,0.02); transition: all 0.3s cubic-bezier(0.16,1,0.3,1); position: relative; overflow: hidden; }
        .upload-card:hover:not(.uploading) { border-color: var(--accent-purple); background: rgba(168,85,247,0.06); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(168,85,247,0.08); }
        .upload-card.uploading { opacity: 0.7; cursor: not-allowed; }
        .upload-card-glow { position: absolute; inset: 0; background: radial-gradient(circle at center, rgba(168,85,247,0.1) 0%, transparent 70%); opacity: 0; transition: opacity 0.3s; }
        .upload-card:hover .upload-card-glow { opacity: 1; }
        .upload-card-icon-box { width: 44px; height: 44px; margin: 0 auto 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-dim); display: flex; align-items: center; justify-content: center; color: var(--accent-purple); transition: all 0.3s; }
        .upload-card:hover .upload-card-icon-box { background: var(--accent-purple); color: #fff; box-shadow: 0 0 15px var(--accent-glow); }
        .upload-card-icon { width: 20px; height: 20px; stroke-width: 2px; }
        .upload-card-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
        .upload-card-subtitle { font-size: 11px; color: var(--text-muted); }
        .upload-status-message { font-size: 11.5px; margin-top: 10px; line-height: 1.5; padding: 8px 12px; border-radius: 8px; border: 1px solid transparent; animation: slideDown 0.3s cubic-bezier(0.16,1,0.3,1) forwards; }
        .upload-status-message.success { background: rgba(16,185,129,0.08); border-color: rgba(16,185,129,0.2); color: #34d399; }
        .upload-status-message.error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: #f87171; }
        
        .upload-progress-bar { width: 100%; height: 4px; background: rgba(168,85,247,0.1); border-radius: 2px; margin-top: 8px; overflow: hidden; }
        .upload-progress-fill { height: 100%; background: linear-gradient(90deg, #a855f7 0%, #c084fc 100%); border-radius: 2px; transition: width 0.3s ease-out; box-shadow: 0 0 8px rgba(168,85,247,0.6); }
        
        .subject-warning { display: flex; align-items: center; font-size: 12px; color: #fbbf24; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.2); padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; animation: slideDown 0.3s cubic-bezier(0.16,1,0.3,1) forwards; }
        
        .retry-btn { background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.25s; box-shadow: 0 2px 8px rgba(249,115,22,0.3); }
        .retry-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(249,115,22,0.5); }
        .retry-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

        .pills-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; margin-top: 4px; }
        .pill-item { font-size: 12px; font-weight: 500; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-dim); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer; transition: all 0.25s; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pill-item:hover { border-color: var(--border-subtle); color: var(--text-primary); background: rgba(255,255,255,0.05); transform: scale(1.02); }
        .pill-item.active { background: var(--accent-purple-dim); border-color: var(--accent-purple); color: #fff; font-weight: 600; box-shadow: 0 0 12px rgba(168,85,247,0.2); }

        .sidebar-divider { height: 1px; background: var(--border-dim); margin: 4px 0; }

        .active-context-card { display: flex; align-items: center; gap: 12px; background: rgba(168,85,247,0.04); border: 1px solid rgba(168,85,247,0.25); border-radius: 12px; padding: 14px; position: relative; overflow: hidden; animation: slideDown 0.3s cubic-bezier(0.16,1,0.3,1) forwards; }
        .active-context-glow { position: absolute; width: 80px; height: 80px; background: radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%); filter: blur(8px); top: -20px; left: -20px; pointer-events: none; }
        .active-context-icon { width: 24px; height: 24px; color: var(--accent-purple); flex-shrink: 0; filter: drop-shadow(0 0 6px var(--accent-glow)); }
        .active-context-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .active-context-title { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .active-context-badge-row { display: flex; align-items: center; gap: 8px; }
        .active-context-badge { font-size: 10px; font-family: 'Space Grotesk', sans-serif; font-weight: 600; color: var(--accent-purple); background: var(--accent-purple-dim); padding: 1px 6px; border-radius: 4px; }
        .active-context-status-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px rgba(16,185,129,0.8); flex-shrink: 0; animation: active-pulse 2s infinite alternate; }
        @keyframes active-pulse { 0% { opacity: 0.5; } 100% { opacity: 1; } }
        .active-context-status-text { font-size: 10px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }

        .chat-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .chat-scroller { flex: 1; overflow-y: auto; padding: 40px 48px; display: flex; flex-direction: column; gap: 28px; }
        .chat-scroller::-webkit-scrollbar { width: 5px; }
        .chat-scroller::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }

        .empty-workspace { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; max-width: 600px; margin: auto; padding: 20px; animation: fade-in 0.6s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .empty-brand-sphere { position: relative; width: 110px; height: 110px; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; }
        .empty-sphere-bg { position: absolute; width: 100%; height: 100%; border-radius: 50%; background: radial-gradient(circle, rgba(168,85,247,0.22) 0%, transparent 70%); filter: blur(8px); animation: breathing-glow 6s infinite ease-in-out; }
        @keyframes breathing-glow { 0%,100% { transform: scale(0.9); opacity: 0.6; } 50% { transform: scale(1.15); opacity: 0.9; } }
        .empty-logo-prism { position: relative; width: 64px; height: 64px; color: var(--accent-purple); filter: drop-shadow(0 0 16px var(--accent-glow)); }
        .empty-title { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 12px; background: linear-gradient(135deg, #ffffff 40%, #c084fc 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .empty-subtitle { font-size: 14.5px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 32px; }
        .intro-features-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; }
        .feature-card { background: var(--bg-card); border: 1px solid var(--border-dim); border-radius: 12px; padding: 18px; text-align: left; transition: all 0.3s; }
        .feature-card:hover { border-color: var(--border-subtle); transform: translateY(-2px); background: rgba(168,85,247,0.03); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .feature-card-icon { width: 22px; height: 22px; color: var(--accent-purple); margin-bottom: 12px; }
        .feature-card-heading { font-size: 13.5px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
        .feature-card-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

        .msg-row { display: flex; width: 100%; animation: msg-slide-in 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes msg-slide-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .msg-row.user { justify-content: flex-end; }
        .msg-row.assistant { justify-content: flex-start; }
        .msg-avatar-wrapper { display: flex; flex-direction: column; align-items: center; margin-right: 14px; flex-shrink: 0; }
        .msg-avatar { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.03); border: 1px solid var(--border-dim); display: flex; align-items: center; justify-content: center; color: var(--accent-purple); }
        .msg-avatar.assistant-avatar { background: rgba(168,85,247,0.1); border-color: var(--border-subtle); box-shadow: 0 0 12px rgba(168,85,247,0.15); }
        .msg-avatar-icon { width: 18px; height: 18px; }

        .bubble { max-width: 72%; border-radius: 16px; padding: 16px 20px; font-size: 14px; line-height: 1.75; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .bubble.user { background: rgba(168,85,247,0.08); border: 1px solid rgba(168,85,247,0.24); border-top-right-radius: 4px; color: var(--text-primary); }
        .bubble.assistant { background: var(--bg-card); border: 1px solid var(--border-dim); border-top-left-radius: 4px; color: #e2e8f0; backdrop-filter: var(--glass-blur); }

        /* ── Markdown styles ── */
        .md-body p { margin-bottom: 10px; }
        .md-body p:last-child { margin-bottom: 0; }
        .md-body strong { font-weight: 700; color: #e2e8f0; }
        .md-body em { font-style: italic; color: var(--text-secondary); }
        .md-body h1, .md-body h2, .md-body h3, .md-body h4 {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          color: #ffffff;
          margin: 18px 0 8px;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }
        .md-body h1 { font-size: 18px; border-bottom: 1px solid var(--border-dim); padding-bottom: 6px; }
        .md-body h2 { font-size: 16px; color: #c084fc; }
        .md-body h3 { font-size: 14.5px; color: var(--text-primary); }
        .md-body h4 { font-size: 13.5px; color: var(--text-secondary); }
        .md-body ul { padding-left: 20px; margin-bottom: 10px; }
        .md-body ol { padding-left: 22px; margin-bottom: 10px; }
        .md-body li { margin-bottom: 5px; line-height: 1.65; }
        .md-body li::marker { color: var(--accent-purple); }
        .md-body blockquote { border-left: 3px solid var(--accent-purple); padding: 8px 14px; margin: 12px 0; background: rgba(168,85,247,0.06); border-radius: 0 8px 8px 0; color: var(--text-secondary); font-style: italic; }
        .md-body code { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); color: #c084fc; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .md-body pre { background: #07080c; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px 18px; margin: 14px 0; overflow-x: auto; }
        .md-body pre code { background: none; border: none; color: #e5e7eb; padding: 0; font-size: 13px; line-height: 1.6; }
        .md-body table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
        .md-body th { background: rgba(168,85,247,0.12); color: #c084fc; font-weight: 600; padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border-subtle); }
        .md-body td { padding: 9px 14px; border-bottom: 1px solid var(--border-dim); color: var(--text-secondary); }
        .md-body tr:hover td { background: rgba(255,255,255,0.02); }
        .md-body hr { border: none; border-top: 1px solid var(--border-dim); margin: 16px 0; }

        .copy-btn { position: absolute; top: 12px; right: 14px; padding: 5px 10px; border: none; border-radius: 999px; background: rgba(255,255,255,0.08); color: #f8fafc; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .copy-btn:hover { background: rgba(255,255,255,0.14); transform: translateY(-1px); }

        .sources-pane { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-dim); }
        .sources-headline { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
        .sources-headline-icon { width: 12px; height: 12px; color: var(--accent-purple); }
        .sources-chips-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .source-tag { font-size: 11.5px; font-weight: 600; font-family: 'Space Grotesk', sans-serif; background: rgba(168,85,247,0.07); border: 1px solid rgba(168,85,247,0.2); color: #c084fc; padding: 4px 10px; border-radius: 6px; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
        .source-tag:hover { background: rgba(168,85,247,0.15); border-color: var(--accent-purple); color: #fff; }
        .source-tag-icon { width: 11px; height: 11px; }
        .source-type-badge { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: rgba(168,85,247,0.2); padding: 1px 5px; border-radius: 3px; color: #d8b4fe; }

        .typing-box { display: flex; gap: 6px; align-items: center; padding: 6px 4px; }
        .typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-purple); box-shadow: 0 0 8px var(--accent-glow); animation: dot-jump 1.4s ease-in-out infinite; opacity: 0.4; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dot-jump { 0%,80%,100% { opacity: 0.4; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-6px); } }

        .input-deck { padding: 0 48px 32px; flex-shrink: 0; background: linear-gradient(to top, var(--bg-space) 75%, transparent); position: relative; z-index: 10; }
        .input-glass-bar { max-width: 900px; margin: 0 auto; background: rgba(15,11,41,0.45); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 14px 18px; backdrop-filter: var(--glass-blur); box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(168,85,247,0.08); transition: all 0.3s; }
        .input-glass-bar:focus-within { border-color: var(--accent-purple); box-shadow: 0 12px 40px rgba(0,0,0,0.7), 0 0 30px rgba(168,85,247,0.16); background: rgba(15,11,41,0.55); }
        .input-flex-row { display: flex; gap: 12px; align-items: flex-end; }
        .chat-textarea { flex: 1; background: transparent; border: none; resize: none; outline: none; font-family: inherit; font-size: 14px; line-height: 1.6; color: var(--text-primary); padding: 6px 0; min-height: 24px; max-height: 140px; overflow-y: auto; }
        .chat-textarea::placeholder { color: var(--text-muted); }
        .action-send-btn { width: 38px; height: 38px; border-radius: 12px; border: none; background: linear-gradient(135deg, #c084fc 0%, var(--accent-purple) 100%); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s; flex-shrink: 0; box-shadow: 0 4px 14px rgba(168,85,247,0.4); }
        .action-send-btn:hover:not(:disabled) { transform: scale(1.08) translateY(-1px); box-shadow: 0 6px 20px rgba(168,85,247,0.6); }
        .action-send-btn:disabled { opacity: 0.2; background: rgba(255,255,255,0.05); cursor: not-allowed; box-shadow: none; }
        .send-btn-icon { width: 16px; height: 16px; stroke-width: 2.5px; }
        .micro-metadata-row { display: flex; justify-content: space-between; max-width: 900px; margin: 8px auto 0; padding: 0 8px; }
        .input-hint-micro { font-size: 10px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.06em; text-transform: uppercase; font-family: 'Space Grotesk', sans-serif; }
      `}</style>

      <div className="ambient-orbs">
        <div className="orb-top-left" />
        <div className="orb-bottom-right" />
        <div className="bg-grid-overlay" />
      </div>

      <div className="layout">
        <header className="header">
          <div className="header-brand" onClick={() => window.location.reload()}>
            <div className="header-logo-container">
              <div className="header-logo-glow" />
              <svg style={{ width: 28, height: 28, color: "var(--accent-purple)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
                <path d="M2 17L12 22L22 17"/>
                <path d="M2 12L12 17L22 12"/>
              </svg>
            </div>
            <h1 className="brand-text">CRAM<span>.ai</span></h1>
          </div>
          <div className="header-right">
            <div className="status-pill">
              <div className="status-dot-pulse" />
              RAG · Gemini 2.5 Active
            </div>
          </div>
        </header>

        <div className="body">
          <aside className="sidebar">

            <div className="sidebar-section">
              <div className="section-header">
                <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                Subject Focus
              </div>
              <div className="field-container">
                <input className="field-input" placeholder="e.g. DBMS, OS, Networks..." value={subject} onChange={e => setSubject(e.target.value)} />
                <svg className="field-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
            </div>

            <div className="sidebar-section">
              <div className="section-header">
                <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                Resource Type
              </div>
              <div className="resource-grid">
                {resourceTypes.map(rt => (
                  <button key={rt.value} className={`resource-btn ${resourceType === rt.value ? "active" : ""}`} onClick={() => setResourceType(rt.value)}>
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <div className="marks-header">
                <div className="section-header" style={{marginBottom:0}}>
                  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
                  Detail Tuning
                </div>
                <div className="marks-val">{marksLabel} · {marks}m</div>
              </div>
              <div className="slider-wrapper">
                <input type="range" min={2} max={10} step={1} value={marks} onChange={e => setMarks(Number(e.target.value))} />
              </div>
            </div>

            <div className="sidebar-divider" />

            <div className="sidebar-section">
              <div className="section-header">
                <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload Material
              </div>
              <label className={`upload-card ${uploading ? "uploading" : ""}`}>
                <div className="upload-card-glow" />
                <div className="upload-card-icon-box">
                  <svg className="upload-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                <div className="upload-card-title">{uploading ? "Ingesting PDF..." : "Drop or Select PDF"}</div>
                <div className="upload-card-subtitle">{uploading ? "Semantic chunking in progress..." : `Will tag as · ${resourceType.toUpperCase()}`}</div>
                {uploading && uploadProgress > 0 && (
                  <div className="upload-progress-bar">
                    <div className="upload-progress-fill" style={{width: `${uploadProgress}%`}} />
                  </div>
                )}
                <input type="file" accept=".pdf" style={{display:"none"}} onChange={handleUpload} disabled={uploading} />
              </label>
              {uploadMsg && <div className={`upload-status-message ${uploadOk ? "success" : "error"}`}>{uploadMsg}</div>}
            </div>

            {(activeFile || subject.trim()) && (
              <div className="sidebar-section">
                <div className="section-header">
                  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  Active Context
                </div>
                <div className="active-context-card">
                  <div className="active-context-glow" />
                  <svg className="active-context-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  <div className="active-context-info">
                    <div className="active-context-title" title={activeFile || `${subject} Context`}>{activeFile || `${subject} Knowledge Index`}</div>
                    <div className="active-context-badge-row">
                      {subject.trim() && <span className="active-context-badge">{subject}</span>}
                      <span className="active-context-status-dot" />
                      <span className="active-context-status-text">Active Doc</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {subjects.length > 0 && (
              <div className="sidebar-section" style={{marginTop:"auto"}}>
                <div className="section-header">
                  <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                  Notes Library
                </div>
                <div className="pills-grid">
                  {subjects.map(s => (
                    <button key={s} className={`pill-item ${subject === s ? "active" : ""}`} title={s} onClick={() => { setSubject(s); setActiveFile("") }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <main className="chat-container">
            <div className="chat-scroller">
              {messages.length === 0 ? (
                <div className="empty-workspace">
                  <div className="empty-brand-sphere">
                    <div className="empty-sphere-bg" />
                    <svg className="empty-logo-prism" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/>
                    </svg>
                  </div>
                  <h2 className="empty-title">Unlock Academic Mastery</h2>
                  <p className="empty-subtitle">Upload your lecture notes, PYQs, or question banks in PDF format, specify a subject, and get instant exam-calibrated answers.</p>
                  <div className="intro-features-grid">
                    <div className="feature-card">
                      <svg className="feature-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <h3 className="feature-card-heading">Exam Prep Mode</h3>
                      <p className="feature-card-desc">Ask questions and get structured answers calibrated to 2, 5, or 10 mark formats.</p>
                    </div>
                    <div className="feature-card">
                      <svg className="feature-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M22 12H2"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      <h3 className="feature-card-heading">Context Reference</h3>
                      <p className="feature-card-desc">Every answer cites the exact source file and subject it retrieved from.</p>
                    </div>
                    <div className="feature-card">
                      <svg className="feature-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                      <h3 className="feature-card-heading">PYQ & IMP Support</h3>
                      <p className="feature-card-desc">Upload previous year papers and important questions for targeted exam prep.</p>
                    </div>
                    <div className="feature-card">
                      <svg className="feature-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <h3 className="feature-card-heading">Semantic Search</h3>
                      <p className="feature-card-desc">Query expansion finds relevant content even when phrasing differs from your notes.</p>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`msg-row ${msg.role}`}>
                    {msg.role === "assistant" && (
                      <div className="msg-avatar-wrapper">
                        <div className="msg-avatar assistant-avatar">
                          <svg className="msg-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                        </div>
                      </div>
                    )}

                    <div className={`bubble ${msg.role}`}>
                      {msg.role === "assistant" && (
                        <button type="button" className="copy-btn" onClick={() => copyToClipboard(msg.content, i)}>
                          {copiedIndex === i ? "Copied!" : "Copy"}
                        </button>
                      )}

                      {msg.role === "assistant" ? (
                        <div className="md-body" style={{paddingRight: "52px"}}>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <div>{msg.content}</div>
                      )}
                      
                      {msg.isRetryable && (
                        <div style={{marginTop: "12px", display: "flex", gap: "8px"}}>
                          <button 
                            className="retry-btn" 
                            onClick={handleRetry}
                            disabled={loading}
                          >
                            {loading ? "Retrying..." : "Retry"}
                          </button>
                          <span style={{fontSize: "11px", color: "var(--text-muted)", alignSelf: "center"}}>
                            Gemini is temporarily unavailable
                          </span>
                        </div>
                      )}

                      {msg.sources?.length > 0 && (
                        <div className="sources-pane">
                          <div className="sources-headline">
                            <svg className="sources-headline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            Sources Cited
                          </div>
                          <div className="sources-chips-row">
                            {[...new Map(msg.sources.map(s => [s.source, s])).values()].map((s, j) => (
                              <span key={j} className="source-tag">
                                <svg className="source-tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                {s.source} · {s.subject}
                                {s.resource_type && s.resource_type !== "notes" && (
                                  <span className="source-type-badge">{s.resource_type.toUpperCase()}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {msg.role === "user" && (
                      <div className="msg-avatar-wrapper" style={{marginRight:0, marginLeft:14}}>
                        <div className="msg-avatar">
                          <svg className="msg-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {loading && (
                <div className="msg-row assistant">
                  <div className="msg-avatar-wrapper">
                    <div className="msg-avatar assistant-avatar">
                      <svg className="msg-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                    </div>
                  </div>
                  <div className="bubble assistant" style={{padding:"12px 18px"}}>
                    <div className="typing-box">
                      <div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="input-deck">
              {noSubjectWarning && (
                <div className="subject-warning">
                  <svg style={{width:16,height:16,marginRight:8}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Please select a subject to search from your notes.
                </div>
              )}
              <div className="input-glass-bar">
                <div className="input-flex-row">
                  <textarea
                    ref={textareaRef}
                    rows={1} className="chat-textarea"
                    placeholder={subject ? `Ask about ${subject} (${resourceType})...` : "Select a subject and ask a question..."}
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button className="action-send-btn" onClick={handleSend} disabled={loading || !question.trim()}>
                    <svg className="send-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              </div>
              <div className="micro-metadata-row">
                <div className="input-hint-micro">[Enter] Send · [Shift + Enter] New Line</div>
                <div className="input-hint-micro">{subject ? `${subject} · ${resourceType.toUpperCase()} · ${marksLabel}` : "No subject selected"}</div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}