import type { StageDef } from '../stage.ts';
import { stage1 } from './stage1.ts';
import { stage2 } from './stage2.ts';
import { testStage } from './test.ts';

/** ステージ一覧（遊ぶ順。前のステージをクリアすると次が遊べるようになる）。ボットの評価もこの順で行う */
export const STAGE_ORDER: StageDef[] = [stage1, stage2];

/**
 * 名前からステージを引く。キーは StageDef.name（プレイ記録にもこの名前で残る）。
 * TEST は仕組みを確かめるための試作ステージで、一覧には載せないが ?stage=TEST とテストから使える。
 */
export const STAGES: Record<string, StageDef> = Object.fromEntries([...STAGE_ORDER, testStage].map((s) => [s.name, s]));
