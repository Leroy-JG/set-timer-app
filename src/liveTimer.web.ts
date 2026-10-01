/** Web / PWA : une page ne peut ni armer d'alarme ni faire défiler une notification en arrière-plan. Sans effet. */
export function startLiveTimer(_endAt: number, _title: string, _text: string, _endTitle: string, _endText: string): boolean {
  return false;
}
export function stopLiveTimer() {}
export function requestBackgroundUnrestricted() {}
export function useBackgroundRestricted(): boolean {
  return false;
}
