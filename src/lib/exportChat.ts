import type { ChatMessage, ConversationSummary, UserAccount, UserProfile } from '../types/index.ts';

export type ExportFormat = 'json' | 'txt';

export interface ExportOptions {
  includeDeleted: boolean;
  includeDetails: boolean;
}

export interface NormalizedExportMessage {
  id: number;
  timestamp: string;
  sender: {
    id: number;
    name: string;
    username: string;
  };
  type: ChatMessage['type'];
  text: string;
  isEncrypted: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  isPinned: boolean;
  replyToMessageId: number | null;
  deliveryStatus: ChatMessage['deliveryStatus'];
  attachments?: Array<{
    fileName: string;
    fileType: string;
    mimeType: string;
    fileSize: number;
    fileUrl: string;
  }>;
  reactions?: Array<{
    username: string;
    emoji: string;
  }>;
  metadata?: Record<string, unknown> | null;
}

export interface ChatExportDocument {
  app: 'SmartConnect';
  exportedAt: string;
  exportedBy: {
    id: number;
    fullName: string;
    username: string;
  } | null;
  conversation: {
    id: number;
    type: ConversationSummary['type'];
    title: string;
    participants: Array<{
      userId: number;
      fullName: string;
      username: string;
    }>;
    messageCount: number;
  };
  messages: NormalizedExportMessage[];
}

export function getConversationDisplayTitle(conversation: ConversationSummary): string {
  if (conversation.type === 'group') {
    return conversation.group?.name || `Group #${conversation.id}`;
  }
  return conversation.peers[0]?.fullName || `Chat #${conversation.id}`;
}

export function sanitizeExportFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const datePart = new Date().toISOString().slice(0, 10);
  return `smartconnect-${slug || 'chat'}-backup-${datePart}`;
}

export function buildChatExportDocument(params: {
  conversation: ConversationSummary;
  messages: ChatMessage[];
  currentUser: UserAccount | null;
  currentProfile: UserProfile | null;
  options: ExportOptions;
}): ChatExportDocument {
  const { conversation, messages, currentUser, currentProfile, options } = params;
  const title = getConversationDisplayTitle(conversation);

  const filtered = options.includeDeleted
    ? messages
    : messages.filter((m) => !m.isDeleted);

  const normalizedMessages: NormalizedExportMessage[] = filtered.map((m) => {
    const resolvedText = m.isDeleted
      ? '[Message deleted]'
      : m.decryptedText || m.content || '';

    const entry: NormalizedExportMessage = {
      id: m.id,
      timestamp: new Date(m.createdAt).toISOString(),
      sender: {
        id: m.senderId,
        name: m.senderName,
        username: m.senderUsername,
      },
      type: m.type,
      text: resolvedText,
      isEncrypted: m.isEncrypted,
      isEdited: m.isEdited,
      isDeleted: m.isDeleted,
      isPinned: m.isPinned,
      replyToMessageId: m.replyToMessageId,
      deliveryStatus: m.deliveryStatus,
    };

    if (options.includeDetails) {
      if (m.attachments && m.attachments.length > 0) {
        entry.attachments = m.attachments.map((a) => ({
          fileName: a.fileName,
          fileType: a.fileType,
          mimeType: a.mimeType,
          fileSize: a.fileSize,
          fileUrl: a.fileUrl,
        }));
      }
      if (m.reactions && m.reactions.length > 0) {
        entry.reactions = m.reactions.map((r) => ({
          username: r.username,
          emoji: r.emoji,
        }));
      }
      if (m.metadataJson) {
        entry.metadata = m.metadataJson;
      }
    }

    return entry;
  });

  const participants = [
    ...(currentUser && currentProfile
      ? [
          {
            userId: currentUser.id,
            fullName: currentProfile.fullName,
            username: currentProfile.username,
          },
        ]
      : []),
    ...conversation.peers.map((p) => ({
      userId: p.userId,
      fullName: p.fullName,
      username: p.username,
    })),
  ];

  return {
    app: 'SmartConnect',
    exportedAt: new Date().toISOString(),
    exportedBy:
      currentUser && currentProfile
        ? {
            id: currentUser.id,
            fullName: currentProfile.fullName,
            username: currentProfile.username,
          }
        : null,
    conversation: {
      id: conversation.id,
      type: conversation.type,
      title,
      participants,
      messageCount: normalizedMessages.length,
    },
    messages: normalizedMessages,
  };
}

export function formatChatExportAsJson(doc: ChatExportDocument): string {
  return JSON.stringify(doc, null, 2);
}

function formatReadableTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatChatExportAsText(
  doc: ChatExportDocument,
  options: ExportOptions
): string {
  const divider = '='.repeat(64);
  const participantNames = doc.conversation.participants
    .map((p) => `${p.fullName} (@${p.username})`)
    .join(', ');

  const lines: string[] = [
    divider,
    'SmartConnect Conversation Backup',
    divider,
    `Conversation : ${doc.conversation.title}`,
    `Chat Type    : ${doc.conversation.type === 'group' ? 'Group Chat' : 'Direct Private Chat'}`,
    `Participants : ${participantNames || 'N/A'}`,
    `Exported At  : ${formatReadableTimestamp(doc.exportedAt)}`,
    `Messages     : ${doc.conversation.messageCount}`,
    divider,
    '',
  ];

  if (doc.messages.length === 0) {
    lines.push('(No messages in this conversation)');
    return lines.join('\n');
  }

  for (const m of doc.messages) {
    const ts = formatReadableTimestamp(m.timestamp);
    const editedFlag = m.isEdited ? ' (edited)' : '';
    const pinnedFlag = m.isPinned ? ' [PINNED]' : '';

    let body = m.text;
    if (m.type === 'location' && m.metadata) {
      const lat = m.metadata.lat ?? m.metadata.latitude;
      const lng = m.metadata.lng ?? m.metadata.longitude;
      body = `[Shared Location: ${lat}, ${lng}]${body ? ` — ${body}` : ''}`;
    } else if (m.type === 'contact' && m.metadata) {
      const name = String(m.metadata.fullName || 'Contact');
      const phone = m.metadata.mobileNumber ? ` (${m.metadata.mobileNumber})` : '';
      body = `[Shared Contact: ${name}${phone}]`;
    } else if (m.type === 'poll' && m.metadata) {
      const q = String(m.metadata.question || 'Poll');
      const opts = Array.isArray(m.metadata.options)
        ? m.metadata.options
            .map((o: any) => `${o.text} (${Array.isArray(o.votes) ? o.votes.length : 0})`)
            .join(' | ')
        : '';
      body = `[Poll: ${q}]${opts ? ` -> ${opts}` : ''}`;
    } else if (!body && m.attachments && m.attachments.length > 0) {
      body = `[${m.type.toUpperCase()} attachment]`;
    }

    lines.push(`[${ts}] ${m.sender.name} (@${m.sender.username})${pinnedFlag}: ${body}${editedFlag}`);

    if (options.includeDetails) {
      if (m.replyToMessageId) {
        lines.push(`  -> Replying to message #${m.replyToMessageId}`);
      }
      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          const kb = Math.max(1, Math.round(att.fileSize / 1024));
          lines.push(
            `  -> Attachment: ${att.fileName} (${att.mimeType}, ${kb} KB) [${att.fileUrl}]`
          );
        }
      }
      if (m.reactions && m.reactions.length > 0) {
        const summary = m.reactions.map((r) => `@${r.username} ${r.emoji}`).join(', ');
        lines.push(`  -> Reactions: ${summary}`);
      }
    }
  }

  return lines.join('\n');
}

export function triggerLocalFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
