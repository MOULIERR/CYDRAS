// Web preview only: no push notifications.
export async function registerForPush(_u: string): Promise<string | null> { return null; }
export function listenForTaps() { return () => {}; }
