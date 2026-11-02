import {pointFromSeat} from './tableLayout'

/** Wrap only dense Macheng single kongs into the existing inner corner.
 * One long row crosses the live wall at 5–11 tiles. Neither wall nor hand moves.
 */
export function denseSingleKongPosition(seat:number,index:number) {
  if (seat===1) return pointFromSeat(seat,3-(index%3)*.85,5.9-Math.floor(index/3))
  // Right/top corners need clearance from the opposite-seat HUD and left river.
  const lateral = seat===3 ? 5.3 : 6
  const forward = seat===2 ? 5.5 : 4
  return pointFromSeat(seat,lateral-(index%4)*.85,forward-Math.floor(index/4)*1.25)
}
