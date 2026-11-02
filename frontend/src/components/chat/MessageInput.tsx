import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  Send,
  Paperclip,
  Mic,
  Smile,
  X,
  Image as ImageIcon,
  FileText,
  Music,
  Trash2,
  CornerUpLeft,
  Edit2,
  Lock,
  AtSign,
} from 'lucide-react';
import { api, type MessageItem, type ChatItem, type GroupDetails } from '../../lib/api';
import { useUIStore } from '../../store/useUIStore';
import { cn } from '../../lib/utils';
import { formatAudioDuration, formatFileSize } from '../../lib/formatters';
import { Avatar } from '../ui/Avatar';

interface MessageInputProps {
  sessionId: string;
  chatJid: string;
  isGroup?: boolean;
  replyingTo?: MessageItem | null;
  editingMessage?: MessageItem | null;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (messageId: string, newText: string) => void;
  onTriggerEditLastMessage?: () => void;
  onMessageSent?: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '🔥', '🙏', '😊', '🎉', '👏', '✨', '👋', '💯', '🤔'];

export const MessageInput: React.FC<MessageInputProps> = ({
  sessionId,
  chatJid,
  isGroup = false,
  replyingTo,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  onSaveEdit,
  onTriggerEditLastMessage,
  onMessageSent,
}) => {
  const queryClient = useQueryClient();
  const enterToSend = useUIStore((s) => s.enterToSend);
  const [text, setText] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mentionedJids, setMentionedJids] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Group Details Query for announceOnly check & member mentions
  const { data: groupDetails } = useQuery<GroupDetails>({
    queryKey: ['groupDetails', sessionId, chatJid],
    queryFn: () => api.getGroupDetails(sessionId, chatJid),
    enabled: isGroup && !!sessionId && !!chatJid,
  });

  const isAnnounceRestricted =
    isGroup && groupDetails?.group.announceOnly && !groupDetails.group.isCurrentUserAdmin;

  // When editingMessage changes, pre-populate text
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || '');
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Optimistic UI cache updater
  const addOptimisticMessage = useCallback(
    (msg: MessageItem, previewText: string) => {
      // 1. Add to messages infinite query cache
      queryClient.setQueriesData<{
        pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
        pageParams: unknown[];
      }>(
        { queryKey: ['messages', sessionId, chatJid] },
        (old) => {
          if (!old || !old.pages || old.pages.length === 0) {
            return {
              pages: [{ messages: [msg], nextCursor: null }],
              pageParams: [undefined],
            };
          }
          const lastIdx = old.pages.length - 1;
          const newPages = [...old.pages];
          newPages[lastIdx] = {
            ...newPages[lastIdx],
            messages: [...newPages[lastIdx].messages, msg],
          };
          return { ...old, pages: newPages };
        },
      );

      // 2. Update chat row and move to top
      queryClient.setQueriesData<{ chats: ChatItem[] }>({ queryKey: ['chats', sessionId] }, (old) => {
        if (!old || !old.chats) return old;
        const idx = old.chats.findIndex((c) => c.jid === chatJid);
        if (idx !== -1) {
          const updated = {
            ...old.chats[idx],
            lastMessageId: msg.id,
            lastMessageText: previewText,
            lastMessageAt: msg.timestamp,
            lastMessageFromMe: true,
          };
          const rest = old.chats.filter((_, i) => i !== idx);
          return { ...old, chats: [updated, ...rest] };
        }
        return old;
      });

      if (onMessageSent) onMessageSent();
    },
    [chatJid, onMessageSent, queryClient, sessionId],
  );

  const markMessageFailed = useCallback(
    (msgId: string) => {
      queryClient.setQueriesData<{
        pages: Array<{ messages: MessageItem[]; nextCursor: string | null }>;
        pageParams: unknown[];
      }>(
        { queryKey: ['messages', sessionId, chatJid] },
        (old) => {
          if (!old || !old.pages) return old;
          return {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              messages: p.messages.map((m) => (m.id === msgId ? { ...m, status: 'failed' } : m)),
            })),
          };
        },
      );
    },
    [chatJid, queryClient, sessionId],
  );

  // File pending upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileCaption, setFileCaption] = useState('');

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Debounced typing presence state
  const lastComposingSentRef = useRef<number>(0);
  const pausedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [text]);

  // Clean up file preview url
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  // Clean up recording timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (pausedTimerRef.current) clearTimeout(pausedTimerRef.current);
    };
  }, []);

  const handleSendTyping = useCallback(
    (state: 'composing' | 'recording' | 'paused') => {
      api.sendTyping(sessionId, chatJid, state).catch(() => {});
    },
    [sessionId, chatJid],
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Detect @ mentions in groups
    if (isGroup) {
      const cursor = e.target.selectionStart;
      const textBeforeCursor = val.slice(0, cursor);
      const match = textBeforeCursor.match(/@([a-zA-Z0-9_\s]*)$/);
      if (match) {
        setMentionQuery(match[1]);
      } else {
        setMentionQuery(null);
      }
    }

    const now = Date.now();
    if (now - lastComposingSentRef.current > 3000 && val.trim().length > 0) {
      lastComposingSentRef.current = now;
      handleSendTyping('composing');
    }

    if (pausedTimerRef.current) clearTimeout(pausedTimerRef.current);
    pausedTimerRef.current = setTimeout(() => {
      handleSendTyping('paused');
    }, 2500);
  };

  const handleSelectMention = (p: { jid: string; name: string }) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = text.slice(0, cursor);
    const textAfterCursor = text.slice(cursor);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    const cleanMention = `@${p.name} `;
    const updated = textBeforeCursor.slice(0, atIndex) + cleanMention + textAfterCursor;
    setText(updated);
    setMentionQuery(null);
    if (!mentionedJids.includes(p.jid)) {
      setMentionedJids([...mentionedJids, p.jid]);
    }
    textareaRef.current.focus();
  };

  const handleSendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Handle Edit Mode save
    if (editingMessage && onSaveEdit) {
      onSaveEdit(editingMessage.id, trimmed);
      setText('');
      if (onCancelEdit) onCancelEdit();
      return;
    }

    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const tempMessage: MessageItem = {
      id: tempId,
      clientId: tempId,
      sessionId,
      chatJid,
      fromMe: true,
      type: 'text',
      text: trimmed,
      caption: null,
      mediaFileName: null,
      mediaMime: null,
      timestamp: new Date().toISOString(),
      status: 'pending',
      replyToMessageId: replyingTo?.id || null,
      isDeleted: false,
      mentionedJids: mentionedJids.length ? mentionedJids : null,
    };

    setText('');
    setMentionedJids([]);
    setMentionQuery(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    handleSendTyping('paused');

    if (onCancelReply) onCancelReply();

    // Add optimistic message and update chat list immediately
    addOptimisticMessage(tempMessage, trimmed);

    try {
      await api.sendText(sessionId, chatJid, {
        text: trimmed,
        quotedMessageId: replyingTo?.id || undefined,
        clientId: tempId,
        mentionedJids: tempMessage.mentionedJids || undefined,
      });
    } catch (err) {
      console.error('Failed to send text:', err);
      markMessageFailed(tempId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (mentionQuery !== null) {
        setMentionQuery(null);
        return;
      }
      if (editingMessage && onCancelEdit) {
        onCancelEdit();
        setText('');
        return;
      }
      if (replyingTo && onCancelReply) {
        onCancelReply();
        return;
      }
    }

    // Up arrow to edit last sent message when input is empty
    if (e.key === 'ArrowUp' && text === '' && !editingMessage && onTriggerEditLastMessage) {
      e.preventDefault();
      onTriggerEditLastMessage();
      return;
    }

    if (enterToSend) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    } else {
      if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) {
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  // File Selection
  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setShowAttachMenu(false);

    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl(null);
    }
    setFileCaption('');
  };

  const handleSendSelectedFile = async () => {
    if (!selectedFile) return;

    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const isImg = selectedFile.type.startsWith('image/');
    const isVid = selectedFile.type.startsWith('video/');
    const isAud = selectedFile.type.startsWith('audio/');
    const kind = isImg ? 'image' : isVid ? 'video' : isAud ? 'audio' : 'document';
    const preview = fileCaption.trim() || (isImg ? 'Photo' : isVid ? 'Video' : isAud ? 'Audio' : selectedFile.name);

    const tempMessage: MessageItem = {
      id: tempId,
      clientId: tempId,
      sessionId,
      chatJid,
      fromMe: true,
      type: kind,
      text: null,
      caption: fileCaption.trim() || null,
      mediaFileName: selectedFile.name,
      mediaMime: selectedFile.type,
      mediaUrl: filePreviewUrl || null,
      mediaPath: filePreviewUrl || null,
      mediaDownloadStatus: 'done',
      timestamp: new Date().toISOString(),
      status: 'pending',
      replyToMessageId: replyingTo?.id || null,
      isDeleted: false,
    };

    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('clientId', tempId);
    if (fileCaption.trim()) fd.append('caption', fileCaption.trim());
    if (replyingTo?.id) fd.append('quotedMessageId', replyingTo.id);

    setSelectedFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    setFileCaption('');
    if (onCancelReply) onCancelReply();

    addOptimisticMessage(tempMessage, preview);

    try {
      await api.sendMedia(sessionId, chatJid, fd);
    } catch (err) {
      console.error('Failed to send media:', err);
      markMessageFailed(tempId);
    }
  };

  const handleCancelSelectedFile = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setFileCaption('');
  };

  // Voice recording
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '',
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);
      handleSendTyping('recording');

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err) {
      console.warn('Microphone permission or MediaRecorder not available:', err);
    }
  };

  const handleStopAndSendVoice = async () => {
    if (!mediaRecorderRef.current) return;
    const recorder = mediaRecorderRef.current;

    recorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      audioChunksRef.current = [];
      recorder.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      handleSendTyping('paused');

      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const tempMessage: MessageItem = {
        id: tempId,
        clientId: tempId,
        sessionId,
        chatJid,
        fromMe: true,
        type: 'audio',
        text: null,
        caption: null,
        mediaFileName: 'Voice note',
        mediaMime: 'audio/ogg; codecs=opus',
        durationSeconds: recordingSeconds,
        timestamp: new Date().toISOString(),
        status: 'pending',
        replyToMessageId: replyingTo?.id || null,
        isDeleted: false,
      };

      addOptimisticMessage(tempMessage, 'Voice message');

      const fd = new FormData();
      fd.append('file', audioBlob, 'voice_note.webm');
      fd.append('clientId', tempId);
      if (replyingTo?.id) fd.append('quotedMessageId', replyingTo.id);

      try {
        await api.sendVoice(sessionId, chatJid, fd);
      } catch (err) {
        console.error('Failed to send voice note:', err);
        markMessageFailed(tempId);
      }
    };

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recorder.stop();
  };

  const handleCancelVoice = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    audioChunksRef.current = [];
    setIsRecording(false);
    handleSendTyping('paused');
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setSelectedFile(file);
          const url = URL.createObjectURL(file);
          setFilePreviewUrl(url);
          setFileCaption('');
          break;
        }
      }
    }
  };

  // Filter mentionable participants
  const mentionCandidates = isGroup
    ? (groupDetails?.participants || []).filter((p) => {
        if (!mentionQuery) return true;
        const q = mentionQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.phoneNumber && p.phoneNumber.includes(q));
      })
    : [];

  // Announce-only restriction check: disable input if user is not admin
  if (isAnnounceRestricted) {
    return (
      <div className="p-4 bg-surface border-t border-border-subtle flex items-center justify-center gap-2 text-xs text-text-muted select-none">
        <Lock className="w-4 h-4 text-warning" />
        <span>Only community admins can send messages to this group.</span>
      </div>
    );
  }

  return (
    <div className="relative bg-surface border-t border-border-subtle flex flex-col">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileChosen}
        className="hidden"
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.zip,.csv,.xls,.xlsx"
        onChange={handleFileChosen}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChosen}
        className="hidden"
      />

      {/* Editing Message Banner */}
      {editingMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-accent-soft/40 border-b border-accent/20 text-xs animate-in slide-in-from-bottom-2 duration-fast">
          <div className="flex items-center gap-2 min-w-0">
            <Edit2 className="w-4 h-4 text-accent shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-accent block">Editing message</span>
              <p className="text-text-muted truncate">{editingMessage.text}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onCancelEdit) onCancelEdit();
              setText('');
            }}
            className="p-1 rounded-control text-text-muted hover:text-text-main hover:bg-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quoted Message Bar */}
      {!editingMessage && replyingTo && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface-subtle border-b border-border-subtle text-xs animate-in slide-in-from-bottom-2 duration-fast">
          <div className="flex items-center gap-2 min-w-0">
            <CornerUpLeft className="w-4 h-4 text-accent shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-accent block">
                Replying to {replyingTo.fromMe ? 'You' : replyingTo.senderName || 'Contact'}
              </span>
              <p className="text-text-muted truncate">
                {replyingTo.text || replyingTo.caption || replyingTo.mediaFileName || 'Attachment'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 rounded-control text-text-muted hover:text-text-main hover:bg-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mention Autocomplete Dropdown Popover */}
      {mentionQuery !== null && mentionCandidates.length > 0 && (
        <div className="absolute bottom-14 left-4 w-64 max-h-48 overflow-y-auto bg-surface border border-border-subtle rounded-card shadow-card p-1.5 z-40 flex flex-col gap-0.5">
          <div className="px-2 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border-subtle/50 mb-1 flex items-center gap-1">
            <AtSign className="w-3 h-3 text-accent" />
            Mention participant
          </div>
          {mentionCandidates.map((p) => (
            <button
              key={p.jid}
              type="button"
              onClick={() => handleSelectMention(p)}
              className="flex items-center gap-2 p-1.5 hover:bg-surface-subtle rounded-control text-left transition-colors"
            >
              <Avatar name={p.name} src={p.profilePictureUrl || undefined} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-main truncate">{p.name}</p>
                <p className="text-[10px] text-text-muted truncate">
                  {p.phoneNumber ? `+${p.phoneNumber}` : p.jid.split('@')[0]}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Attachment Preview Modal / Bar */}
      {selectedFile && (
        <div className="p-4 bg-surface-subtle border-b border-border-subtle flex flex-col md:flex-row items-center gap-4 animate-in fade-in duration-fast">
          {filePreviewUrl ? (
            <div className="w-24 h-24 rounded-card overflow-hidden border border-border-subtle bg-black shrink-0 flex items-center justify-center">
              {selectedFile.type.startsWith('image/') ? (
                <img src={filePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <video src={filePreviewUrl} className="w-full h-full object-cover" />
              )}
            </div>
          ) : (
            <div className="w-16 h-16 rounded-card bg-surface border border-border-subtle flex items-center justify-center text-accent shrink-0">
              <FileText className="w-8 h-8" />
            </div>
          )}

          <div className="flex-1 w-full min-w-0 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-main truncate max-w-xs">
                {selectedFile.name}
              </span>
              <span className="text-[11px] text-text-muted">
                {formatFileSize(selectedFile.size)}
              </span>
            </div>
            <input
              type="text"
              value={fileCaption}
              onChange={(e) => setFileCaption(e.target.value)}
              placeholder="Add a caption..."
              className="w-full bg-surface text-text-main text-xs rounded-control px-3 py-2 border border-border-subtle outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCancelSelectedFile}
              className="p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface transition-colors"
              title="Cancel attachment"
            >
              <Trash2 className="w-4 h-4 text-danger" />
            </button>
            <button
              type="button"
              onClick={handleSendSelectedFile}
              className="px-4 py-2 rounded-control bg-accent text-white text-xs font-medium hover:bg-accent-hover shadow-subtle flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>Send</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Input Controls or Active Recording Bar */}
      {isRecording ? (
        <div className="px-4 py-3 flex items-center justify-between gap-3 bg-accent-soft/40 animate-in fade-in duration-fast">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-danger animate-pulse" />
            <span className="text-sm font-semibold text-text-main">
              Recording voice... {formatAudioDuration(recordingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelVoice}
              className="p-2 rounded-control text-text-muted hover:text-danger hover:bg-surface transition-colors"
              title="Discard recording"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleStopAndSendVoice}
              className="px-3.5 py-1.5 rounded-control bg-accent text-white text-xs font-medium hover:bg-accent-hover shadow-subtle flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 flex items-end gap-2">
          {/* Attach Menu Trigger & Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className={cn(
                'p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors',
                showAttachMenu && 'bg-surface-subtle text-accent',
              )}
              title="Attach media or document"
              aria-label="Attach media or document"
            >
              <Paperclip className="w-5 h-5 stroke-[1.75]" />
            </button>

            {showAttachMenu && (
              <div className="absolute bottom-12 left-0 w-48 bg-surface border border-border-subtle rounded-card shadow-card p-1.5 flex flex-col gap-1 z-30 animate-in fade-in zoom-in-95 duration-fast">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-main hover:bg-surface-subtle rounded-control transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-accent" />
                  <span>Photos & Videos</span>
                </button>
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-main hover:bg-surface-subtle rounded-control transition-colors"
                >
                  <FileText className="w-4 h-4 text-info" />
                  <span>Documents</span>
                </button>
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-main hover:bg-surface-subtle rounded-control transition-colors"
                >
                  <Music className="w-4 h-4 text-warning" />
                  <span>Audio File</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick Emoji Bar / Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={cn(
                'p-2 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors',
                showEmojiPicker && 'bg-surface-subtle text-accent',
              )}
              title="Emojis"
              aria-label="Emojis"
            >
              <Smile className="w-5 h-5 stroke-[1.75]" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-12 left-0 p-2 bg-surface border border-border-subtle rounded-card shadow-card grid grid-cols-6 gap-1 z-30 animate-in fade-in zoom-in-95 duration-fast">
                {COMMON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setText((prev) => prev + emoji);
                      setShowEmojiPicker(false);
                      textareaRef.current?.focus();
                    }}
                    className="p-1.5 text-lg hover:bg-surface-subtle rounded-control transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Text Input Area */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              editingMessage
                ? 'Edit your message (Press Enter to save, Esc to cancel)...'
                : enterToSend
                ? 'Type a message (@ to mention, Shift+Enter for newline)...'
                : 'Type a message (@ to mention, Shift+Enter to send)...'
            }
            className="flex-1 max-h-32 bg-surface-subtle text-text-main placeholder:text-text-muted text-sm rounded-control px-3.5 py-2 outline-none border border-transparent focus:border-accent focus:bg-surface transition-all duration-fast resize-none leading-relaxed"
          />

          {/* Send or Voice Record Button */}
          {text.trim().length > 0 ? (
            <button
              type="button"
              onClick={handleSendMessage}
              className="p-2 rounded-control bg-accent text-white hover:bg-accent-hover shadow-subtle transition-colors shrink-0"
              title={editingMessage ? 'Save edit' : 'Send message'}
              aria-label={editingMessage ? 'Save edit' : 'Send message'}
            >
              {editingMessage ? <Edit2 className="w-4 h-4 stroke-[1.75]" /> : <Send className="w-4 h-4 stroke-[1.75]" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartRecording}
              className="p-2 rounded-control text-text-muted hover:text-accent hover:bg-surface-subtle transition-colors shrink-0"
              title="Record voice note"
              aria-label="Record voice note"
            >
              <Mic className="w-5 h-5 stroke-[1.75]" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
