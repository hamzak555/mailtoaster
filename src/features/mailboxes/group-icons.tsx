'use client';

import type { MailboxGroup, MailboxGroupIconId } from '@shared/mailboxes';
import { getMailboxGroupEmojiFallback, normalizeMailboxGroupEmoji } from '@shared/mailboxes';

import { cn } from '@/lib/utils';

export type GroupEmojiOption = {
  emoji: string;
  label: string;
  keywords: string[];
};

export const GROUP_EMOJI_OPTIONS: GroupEmojiOption[] = [
  { emoji: '📥', label: 'Inbox Tray', keywords: ['inbox', 'mail', 'incoming'] },
  { emoji: '🗂️', label: 'Card Index Dividers', keywords: ['folders', 'group', 'organize'] },
  { emoji: '📁', label: 'Folder', keywords: ['folder', 'files', 'workspace'] },
  { emoji: '💼', label: 'Briefcase', keywords: ['work', 'business', 'clients'] },
  { emoji: '🏢', label: 'Office Building', keywords: ['office', 'company', 'hq'] },
  { emoji: '👥', label: 'People', keywords: ['team', 'people', 'staff'] },
  { emoji: '💬', label: 'Speech Balloon', keywords: ['chat', 'messages', 'conversation'] },
  { emoji: '🛍️', label: 'Shopping Bags', keywords: ['shopping', 'retail', 'orders'] },
  { emoji: '🧾', label: 'Receipt', keywords: ['finance', 'billing', 'expenses'] },
  { emoji: '📣', label: 'Megaphone', keywords: ['marketing', 'announcements', 'campaigns'] },
  { emoji: '🎧', label: 'Headphones', keywords: ['support', 'customer service', 'helpdesk'] },
  { emoji: '⭐', label: 'Star', keywords: ['priority', 'important', 'favorites'] },
  { emoji: '📚', label: 'Books', keywords: ['reference', 'docs', 'knowledge'] },
  { emoji: '🗄️', label: 'File Cabinet', keywords: ['archive', 'storage', 'history'] },
  { emoji: '💰', label: 'Money Bag', keywords: ['sales', 'revenue', 'money'] },
  { emoji: '🔔', label: 'Bell', keywords: ['alerts', 'notifications', 'watch'] },
  { emoji: '📘', label: 'Blue Book', keywords: ['saved', 'reading', 'notes'] },
  { emoji: '📅', label: 'Calendar', keywords: ['events', 'schedule', 'planning'] },
  { emoji: '📸', label: 'Camera', keywords: ['content', 'creative', 'media'] },
  { emoji: '📊', label: 'Bar Chart', keywords: ['analytics', 'metrics', 'reports'] },
  { emoji: '📈', label: 'Chart Increasing', keywords: ['growth', 'performance', 'kpis'] },
  { emoji: '📋', label: 'Clipboard', keywords: ['tasks', 'operations', 'checklist'] },
  { emoji: '💻', label: 'Laptop', keywords: ['engineering', 'product', 'development'] },
  { emoji: '⚙️', label: 'Gear', keywords: ['settings', 'ops', 'configuration'] },
  { emoji: '📄', label: 'Page Facing Up', keywords: ['documents', 'contracts', 'notes'] },
  { emoji: '🚩', label: 'Triangular Flag', keywords: ['goals', 'milestones', 'important'] },
  { emoji: '🌍', label: 'Globe', keywords: ['global', 'international', 'web'] },
  { emoji: '❤️', label: 'Heart', keywords: ['personal', 'community', 'care'] },
  { emoji: '🏠', label: 'House', keywords: ['home', 'family', 'personal'] },
  { emoji: '🖼️', label: 'Framed Picture', keywords: ['design', 'creative', 'assets'] },
  { emoji: '🔲', label: 'Grid', keywords: ['layout', 'projects', 'board'] },
  { emoji: '💡', label: 'Light Bulb', keywords: ['ideas', 'strategy', 'brainstorm'] },
  { emoji: '📍', label: 'Round Pushpin', keywords: ['locations', 'field', 'travel'] },
  { emoji: '🖥️', label: 'Desktop Computer', keywords: ['desktop', 'tech', 'ops'] },
  { emoji: '📦', label: 'Package', keywords: ['shipping', 'fulfillment', 'deliveries'] },
  { emoji: '🚀', label: 'Rocket', keywords: ['launch', 'growth', 'projects'] },
  { emoji: '🛡️', label: 'Shield', keywords: ['security', 'compliance', 'admin'] },
  { emoji: '🏪', label: 'Convenience Store', keywords: ['store', 'shop', 'commerce'] },
  { emoji: '🏷️', label: 'Label', keywords: ['tags', 'categories', 'segments'] },
  { emoji: '🔧', label: 'Wrench', keywords: ['tools', 'maintenance', 'operations'] },
  { emoji: '📨', label: 'Incoming Envelope', keywords: ['email', 'mail', 'messages'] },
  { emoji: '🤝', label: 'Handshake', keywords: ['partnerships', 'clients', 'relationships'] },
  { emoji: '🎯', label: 'Bullseye', keywords: ['targets', 'goals', 'focus'] },
  { emoji: '🎨', label: 'Artist Palette', keywords: ['design', 'brand', 'creative'] },
  { emoji: '🧠', label: 'Brain', keywords: ['strategy', 'thinking', 'ideas'] },
  { emoji: '🏆', label: 'Trophy', keywords: ['wins', 'priority', 'achievements'] },
  { emoji: '🧩', label: 'Puzzle Piece', keywords: ['product', 'systems', 'planning'] },
  { emoji: '🔒', label: 'Lock', keywords: ['security', 'private', 'restricted'] },
  { emoji: '🗝️', label: 'Key', keywords: ['access', 'admin', 'credentials'] },
  { emoji: '📌', label: 'Pushpin', keywords: ['pinned', 'important', 'saved'] },
  { emoji: '✈️', label: 'Airplane', keywords: ['travel', 'routes', 'field'] },
  { emoji: '📞', label: 'Telephone', keywords: ['calls', 'support', 'outreach'] },
  { emoji: '📝', label: 'Memo', keywords: ['notes', 'writing', 'drafts'] },
  { emoji: '📎', label: 'Paperclip', keywords: ['attachments', 'files', 'docs'] },
  { emoji: '🕒', label: 'Clock', keywords: ['time', 'sla', 'scheduling'] },
  { emoji: '🔍', label: 'Magnifying Glass', keywords: ['search', 'research', 'review'] },
  { emoji: '☕', label: 'Coffee', keywords: ['personal', 'casual', 'daily'] },
  { emoji: '🎉', label: 'Party Popper', keywords: ['celebrations', 'events', 'campaigns'] },
  { emoji: '🌱', label: 'Seedling', keywords: ['growth', 'new', 'nurture'] },
  { emoji: '🧳', label: 'Luggage', keywords: ['travel', 'projects', 'handoff'] },
  { emoji: '📡', label: 'Satellite Antenna', keywords: ['ops', 'monitoring', 'signals'] },
  { emoji: '🧑‍💻', label: 'Technologist', keywords: ['coding', 'product', 'engineering'] },
  { emoji: '📬', label: 'Open Mailbox', keywords: ['mailbox', 'letters', 'inbound'] },
  { emoji: '📤', label: 'Outbox Tray', keywords: ['outbound', 'sent', 'sending'] },
  { emoji: '📂', label: 'Open Folder', keywords: ['folder', 'open', 'working'] },
  { emoji: '🗃️', label: 'Card File Box', keywords: ['records', 'archive', 'filing'] },
  { emoji: '🏬', label: 'Department Store', keywords: ['store', 'retail', 'commerce'] },
  { emoji: '🏭', label: 'Factory', keywords: ['operations', 'manufacturing', 'production'] },
  { emoji: '🏛️', label: 'Classical Building', keywords: ['legal', 'government', 'compliance'] },
  { emoji: '🏗️', label: 'Building Construction', keywords: ['build', 'construction', 'projects'] },
  { emoji: '🏦', label: 'Bank', keywords: ['finance', 'money', 'banking'] },
  { emoji: '🛠️', label: 'Hammer and Wrench', keywords: ['tools', 'building', 'maintenance'] },
  { emoji: '⚖️', label: 'Balance Scale', keywords: ['legal', 'policy', 'fairness'] },
  { emoji: '🧮', label: 'Abacus', keywords: ['math', 'finance', 'accounting'] },
  { emoji: '💳', label: 'Credit Card', keywords: ['payments', 'billing', 'cards'] },
  { emoji: '💸', label: 'Money With Wings', keywords: ['spend', 'budgets', 'expenses'] },
  { emoji: '📉', label: 'Chart Decreasing', keywords: ['decline', 'risk', 'metrics'] },
  { emoji: '📇', label: 'Card Index', keywords: ['contacts', 'crm', 'directory'] },
  { emoji: '🗓️', label: 'Spiral Calendar', keywords: ['calendar', 'events', 'planning'] },
  { emoji: '⏰', label: 'Alarm Clock', keywords: ['alerts', 'deadlines', 'reminders'] },
  { emoji: '⌛', label: 'Hourglass', keywords: ['waiting', 'timers', 'time'] },
  { emoji: '✅', label: 'Check Mark Button', keywords: ['done', 'approved', 'complete'] },
  { emoji: '📓', label: 'Notebook', keywords: ['notes', 'journal', 'planning'] },
  { emoji: '📒', label: 'Ledger', keywords: ['records', 'finance', 'books'] },
  { emoji: '📕', label: 'Closed Book', keywords: ['docs', 'reference', 'reading'] },
  { emoji: '📙', label: 'Orange Book', keywords: ['reference', 'notes', 'manual'] },
  { emoji: '📔', label: 'Notebook With Decorative Cover', keywords: ['ideas', 'notes', 'personal'] },
  { emoji: '📰', label: 'Newspaper', keywords: ['news', 'press', 'updates'] },
  { emoji: '📢', label: 'Loudspeaker', keywords: ['broadcast', 'announcements', 'marketing'] },
  { emoji: '📺', label: 'Television', keywords: ['media', 'video', 'content'] },
  { emoji: '🎬', label: 'Clapper Board', keywords: ['video', 'production', 'editing'] },
  { emoji: '🎤', label: 'Microphone', keywords: ['audio', 'podcast', 'speaking'] },
  { emoji: '🎵', label: 'Musical Note', keywords: ['audio', 'music', 'sound'] },
  { emoji: '📱', label: 'Mobile Phone', keywords: ['mobile', 'phone', 'devices'] },
  { emoji: '☎️', label: 'Telephone', keywords: ['calls', 'support', 'phones'] },
  { emoji: '🧭', label: 'Compass', keywords: ['direction', 'strategy', 'navigation'] },
  { emoji: '🗺️', label: 'World Map', keywords: ['travel', 'locations', 'global'] },
  { emoji: '🌐', label: 'Globe With Meridians', keywords: ['internet', 'web', 'global'] },
  { emoji: '🔗', label: 'Link', keywords: ['links', 'connected', 'integration'] },
  { emoji: '🪄', label: 'Magic Wand', keywords: ['automation', 'magic', 'quick actions'] },
  { emoji: '🔬', label: 'Microscope', keywords: ['research', 'analysis', 'science'] },
  { emoji: '🧪', label: 'Test Tube', keywords: ['testing', 'labs', 'experiments'] },
  { emoji: '🧱', label: 'Brick', keywords: ['infrastructure', 'building', 'foundation'] },
  { emoji: '🛰️', label: 'Satellite', keywords: ['space', 'monitoring', 'signals'] },
  { emoji: '🤖', label: 'Robot', keywords: ['automation', 'ai', 'bots'] },
  { emoji: '🧑‍🔬', label: 'Scientist', keywords: ['research', 'labs', 'science'] },
  { emoji: '🧑‍🏫', label: 'Teacher', keywords: ['training', 'education', 'learning'] },
  { emoji: '🧑‍⚖️', label: 'Judge', keywords: ['legal', 'policy', 'review'] },
  { emoji: '🧑‍💼', label: 'Office Worker', keywords: ['business', 'operations', 'office'] },
  { emoji: '👨‍👩‍👧‍👦', label: 'Family', keywords: ['family', 'personal', 'household'] },
  { emoji: '🫶', label: 'Heart Hands', keywords: ['community', 'care', 'support'] },
  { emoji: '🙏', label: 'Folded Hands', keywords: ['thanks', 'care', 'personal'] },
  { emoji: '🌟', label: 'Glowing Star', keywords: ['favorites', 'priority', 'special'] },
  { emoji: '🔥', label: 'Fire', keywords: ['urgent', 'hot', 'priority'] },
  { emoji: '🌈', label: 'Rainbow', keywords: ['creative', 'lifestyle', 'personal'] },
  { emoji: '🌊', label: 'Water Wave', keywords: ['flow', 'calm', 'movement'] },
  { emoji: '⛰️', label: 'Mountain', keywords: ['goals', 'challenge', 'outdoors'] },
  { emoji: '🏖️', label: 'Beach', keywords: ['travel', 'leisure', 'personal'] },
  { emoji: '🏕️', label: 'Camping', keywords: ['outdoors', 'travel', 'personal'] },
  { emoji: '🍽️', label: 'Fork and Knife With Plate', keywords: ['food', 'restaurants', 'hospitality'] },
  { emoji: '🍷', label: 'Wine Glass', keywords: ['events', 'hospitality', 'lifestyle'] },
  { emoji: '🛒', label: 'Shopping Cart', keywords: ['shopping', 'orders', 'ecommerce'] },
  { emoji: '🎁', label: 'Wrapped Gift', keywords: ['gifts', 'offers', 'campaigns'] },
  { emoji: '🏅', label: 'Sports Medal', keywords: ['achievement', 'wins', 'recognition'] },
  { emoji: '⚽', label: 'Soccer Ball', keywords: ['sports', 'teams', 'recreation'] },
  { emoji: '🏋️', label: 'Weight Lifter', keywords: ['fitness', 'health', 'personal'] },
  { emoji: '🩺', label: 'Stethoscope', keywords: ['health', 'medical', 'care'] },
  { emoji: '💊', label: 'Pill', keywords: ['health', 'medical', 'pharmacy'] },
  { emoji: '🐾', label: 'Paw Prints', keywords: ['pets', 'animals', 'personal'] },
  { emoji: '🌸', label: 'Cherry Blossom', keywords: ['spring', 'personal', 'soft'] },
  { emoji: '🍀', label: 'Four Leaf Clover', keywords: ['luck', 'favorites', 'personal'] },
  { emoji: '🪴', label: 'Potted Plant', keywords: ['plants', 'home', 'growth'] },
  { emoji: '🕹️', label: 'Joystick', keywords: ['games', 'fun', 'personal'] },
  { emoji: '🎮', label: 'Video Game', keywords: ['gaming', 'fun', 'hobbies'] },
  { emoji: '🧸', label: 'Teddy Bear', keywords: ['family', 'kids', 'personal'] },
  { emoji: '🛏️', label: 'Bed', keywords: ['home', 'rest', 'personal'] },
  { emoji: '🚗', label: 'Automobile', keywords: ['car', 'travel', 'field'] },
  { emoji: '🚚', label: 'Delivery Truck', keywords: ['logistics', 'shipping', 'delivery'] },
  { emoji: '🚲', label: 'Bicycle', keywords: ['mobility', 'travel', 'personal'] },
  { emoji: '🚦', label: 'Traffic Light', keywords: ['status', 'traffic', 'ops'] },
  { emoji: '🏁', label: 'Chequered Flag', keywords: ['finish', 'launch', 'milestone'] },
];

interface GroupIconProps {
  className?: string;
  emoji?: MailboxGroup['emoji'] | undefined;
  iconId: MailboxGroupIconId;
  groupId?: string;
}

export function resolveGroupEmoji(emoji: MailboxGroup['emoji'], iconId: MailboxGroupIconId, groupId?: string) {
  return normalizeMailboxGroupEmoji(emoji) ?? getMailboxGroupEmojiFallback(groupId, iconId);
}

export function GroupIcon({ className, emoji, iconId, groupId }: GroupIconProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-['Apple_Color_Emoji','Segoe_UI_Emoji','Noto_Color_Emoji','sans-serif'] leading-none",
        className,
      )}
      aria-hidden="true"
    >
      {resolveGroupEmoji(emoji ?? null, iconId, groupId)}
    </span>
  );
}
