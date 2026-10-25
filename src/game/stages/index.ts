import type { StageDef } from '../stage.ts';
import { testStage } from './test.ts';

/** ステージ一覧。キーは StageDef.name（プレイ記録にもこの名前で残る） */
export const STAGES: Record<string, StageDef> = Object.fromEntries([testStage].map((s) => [s.name, s]));
