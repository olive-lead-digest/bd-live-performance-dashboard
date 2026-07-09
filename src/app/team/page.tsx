'use client';

import { useUrlTab } from '@/lib/useUrlTab';
import { TabBar } from '@/components/TabBar';
import { Trophy, Award, SplitSquareHorizontal } from 'lucide-react';
import Leaderboard from '@/app/leaderboard/page';
import RankingPage from '@/app/ranking/page';
import Compare from '@/app/compare/page';

const TABS = [
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'ranking', label: 'Ranking', icon: Award },
  { id: 'compare', label: 'Compare', icon: SplitSquareHorizontal },
];

export default function TeamPage() {
  const [tab, setTab] = useUrlTab('tab', ['leaderboard', 'ranking', 'compare'], 'leaderboard');

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="sr-only">Team</h1>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>
      {tab === 'leaderboard' && <Leaderboard />}
      {tab === 'ranking' && <RankingPage />}
      {tab === 'compare' && <Compare />}
    </div>
  );
}
