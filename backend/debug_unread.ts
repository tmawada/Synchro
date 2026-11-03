// This is a mock script to verify the unread logic, not the actual file.
// The actual logic is in auth.service.ts
const allMessages = Array.from({length: 250}, (_, i) => ({ id: `msg_${i}`, labelIds: i % 10 === 0 ? [] : ['UNREAD'] }));
const BATCH_SIZE = 10;
let totalUnreadCount = 0;

for (let i = 0; i < allMessages.length; i += BATCH_SIZE) {
  const batch = allMessages.slice(i, i + BATCH_SIZE);
  // Simulate API call
  const results = batch.map(msg => {
    // !labelIds.includes('UNREAD') is true if read
    return !msg.labelIds.includes('UNREAD');
  });
  // If isRead is false, it's UNREAD.
  // The current code: return !data.labelIds?.includes('UNREAD');
  // If labelIds includes UNREAD, !data.labelIds.includes('UNREAD') is FALSE.
  // So results will be FALSE for UNREAD mails.
  // results.filter(isRead => isRead === false) correctly counts UNREAD.
  totalUnreadCount += results.filter((isRead) => isRead === false).length;
}

console.log('Total:', allMessages.length);
console.log('Unread:', totalUnreadCount);
