// Web preview only: no GPS tracking.
export async function askLocation(): Promise<'always' | 'while-using' | 'denied'> { return 'denied'; }
export async function startShiftTracking(_c: string): Promise<'always' | 'while-using' | 'denied'> { return 'denied'; }
export async function stopShiftTracking() {}
