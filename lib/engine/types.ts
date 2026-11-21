export type Seat = 0 | 1;
export type Orientation = "h" | "v";

export interface Cell {
  r: number;
  c: number;
}

export interface Wall {
  r: number;
  c: number;
  o: Orientation;
}

export interface GameState {
  pawns: [Cell, Cell];
  walls: Wall[];
  wallsLeft: [number, number];
}

export type PawnMove = { type: "pawn"; r: number; c: number };
export type WallMove = { type: "wall"; r: number; c: number; o: Orientation };
export type Move = PawnMove | WallMove;

export type WallReason = "out_of_bounds" | "overlap" | "cross" | "blocks_path" | "no_walls_left";

export interface WallCheck {
  ok: boolean;
  reason?: WallReason;
}

export const BOARD_SIZES = [5, 7, 9] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];
