// Verifica se já existe relação prévia (segue ou seguido) ou thread recente
export const hasConsent = async (ig, userId) => {
  try {
    const friendship = await ig.friendship.show(userId);
    if (friendship?.following || friendship?.followed_by) return true;

    const inbox = await ig.feed.directInbox().items();
    const hasThread = inbox.some((thread) => thread.users?.some((u) => u.pk === userId));
    return hasThread;
  } catch (err) {
    return false;
  }
};

export default hasConsent;
