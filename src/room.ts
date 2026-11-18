import type { TextureInfo } from '@manifest';
import rooms from './rooms.json';
import slots from './textures/slots.json';
import type { AnyTexture } from './uploads/types';

export type Slot = keyof typeof slots;

export type RoomKey = keyof typeof rooms;
export const ROOMS = rooms;
export const isRoom = (value: string): value is RoomKey => Object.hasOwn(rooms, value);

export const accepts = (slot: Slot, category: TextureInfo['category']) => (slots[slot] as string[]).includes(category);
// Uploaded textures fit every surface (PRD 16.7).
export const fits = (slot: Slot, texture: AnyTexture) => 'uploaded' in texture || accepts(slot, texture.category);

export const SLOT_NAMES: Record<Slot, string> = {
  floor: 'Floor',
  featureWall: 'Feature wall',
  walls: 'Walls',
  slatWall: 'Slat wall',
  upholstery: 'Upholstery',
  accents: 'Accents',
  bedding: 'Bedding',
  rugs: 'Rugs',
  woodwork: 'Woodwork',
  showerWall: 'Shower wall',
  vanity: 'Vanity',
  countertop: 'Countertop',
  towels: 'Towels',
  ground: 'Ground',
  path: 'Path',
  deck: 'Deck',
  fence: 'Fence',
  rocks: 'Rocks',
  cushions: 'Cushions',
};

// Shown until a slot has a texture.
export const PLACEHOLDER: Record<Slot, string> = {
  floor: '#b89b7a',
  featureWall: '#c9c2b8',
  walls: '#e8e4de',
  slatWall: '#9a7552',
  upholstery: '#8a8f8a',
  accents: '#c4a484',
  bedding: '#ecebe6',
  rugs: '#a39b8f',
  woodwork: '#7a5a40',
  showerWall: '#d6d8d6',
  vanity: '#8b6a4b',
  countertop: '#cfcac2',
  towels: '#e7e2d8',
  ground: '#7c8f5a',
  path: '#a9a59d',
  deck: '#9b7a58',
  fence: '#7d6249',
  rocks: '#8f8c86',
  cushions: '#b8a690',
};
