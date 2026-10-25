import type { StageDef } from '../stage.ts';
import { stage1 } from './stage1.ts';
import { stage2 } from './stage2.ts';
import { stage3 } from './stage3.ts';
import { stage4 } from './stage4.ts';
import { stage5 } from './stage5.ts';
import { testStage } from './test.ts';
import { tutorial } from './tutorial.ts';

/** ステージ一覧（遊ぶ順。前のステージをクリアすると、拠点に次の入口が現れる） */
export const STAGE_ORDER: StageDef[] = [stage1, stage2, stage3, stage4, stage5];

/** ボットで評価するステージ（チュートリアルは判定の一部だけ） */
export const BOT_STAGES: StageDef[] = [tutorial, ...STAGE_ORDER];

export { tutorial };

/**
 * 名前からステージを引く。キーは StageDef.name（プレイ記録にもこの名前で残る）。
 * TEST は仕組みを確かめるための試作ステージで、一覧には載せないが ?stage=TEST とテストから使える。
 * 拠点（HUB）はクリアの記録から組み立てるので、ここには入れない（stages/hub.ts）。
 */
export const STAGES: Record<string, StageDef> = Object.fromEntries([tutorial, ...STAGE_ORDER, testStage].map((s) => [s.name, s]));
