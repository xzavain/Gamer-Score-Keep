/* GamerScore Keep — GAME_THEMES: one place for every game type's identity.
   Each game type gets an emoji, display name, accent color, a scorekeeper
   hint, and the scoring defaults its preset applies. New presets added here
   are automatically styled on cards, headers, and the preset picker. */
(function(){
'use strict';

const GAME_THEMES = {
  mexican_train: {
    name: 'Mexican Train Dominoes', emoji: '🚂', color: '#F59E0B',
    hint: 'Lowest total wins. Tap engine tiles as doubles are played.',
    defaults: { scoring_mode: 'rounds', win_condition: 'lowest', target_score: '' },
    namePlaceholder: 'Mexican Train — Friday Night',
  },
  bingo: {
    name: 'Bingo', emoji: '🎱', color: '#06B6D4',
    hint: 'Mark the winner of each bingo round (1 point per win).',
    defaults: { scoring_mode: 'rounds', win_condition: 'highest', target_score: '' },
    namePlaceholder: 'Bingo Night',
  },
  uno: {
    name: 'Uno', emoji: '🃏', color: '#EF4444',
    hint: 'Hand winner scores opponents\u2019 leftover card points. First to 500 wins.',
    defaults: { scoring_mode: 'rounds', win_condition: 'highest', target_score: 500 },
    namePlaceholder: 'Uno Showdown',
  },
  uno_no_mercy: {
    name: 'Uno No Mercy', emoji: '💀', color: '#991B1B', badge: 'NO MERCY',
    hint: 'Same scoring as Uno — but brutal. First to 500 wins. No mercy.',
    defaults: { scoring_mode: 'rounds', win_condition: 'highest', target_score: 500 },
    namePlaceholder: 'Uno No Mercy 😈',
  },
  monopoly: {
    name: 'Monopoly', emoji: '🎩', color: '#10B981', money: true,
    hint: 'Enter each player\u2019s cash change per round (negative allowed). Bankrupt players can be eliminated with 💀.',
    defaults: { scoring_mode: 'rounds', win_condition: 'highest', target_score: '' },
    namePlaceholder: 'Monopoly Marathon',
  },
  scrabble: {
    name: 'Scrabble', emoji: '🔤', color: '#8B5CF6',
    hint: 'Highest total word score wins.',
    defaults: { scoring_mode: 'rounds', win_condition: 'highest', target_score: '' },
    namePlaceholder: 'Scrabble Night',
  },
  yahtzee: {
    name: 'Yahtzee', emoji: '🎲', color: '#F97316',
    hint: 'Highest total wins across 13 rounds.',
    defaults: { scoring_mode: 'rounds', win_condition: 'highest', target_score: '' },
    namePlaceholder: 'Yahtzee!',
  },
  golf: {
    name: 'Golf', emoji: '⛳', color: '#10B981',
    hint: 'Lowest total across 9 or 18 holes wins.',
    defaults: { scoring_mode: 'rounds', win_condition: 'lowest', target_score: '' },
    namePlaceholder: 'Sunday Golf',
  },
  hearts: {
    name: 'Hearts', emoji: '♥️', color: '#EC4899',
    hint: 'Avoid points — lowest total wins.',
    defaults: { scoring_mode: 'rounds', win_condition: 'lowest', target_score: '' },
    namePlaceholder: 'Hearts',
  },
  custom: {
    name: 'Custom game', emoji: '✨', color: '#6366F1',
    hint: '',
    defaults: { scoring_mode: 'rounds', win_condition: 'highest', target_score: '' },
    namePlaceholder: 'Friday Night Game',
  },
};

const PRESET_ORDER = ['mexican_train', 'bingo', 'uno', 'uno_no_mercy', 'monopoly', 'scrabble', 'yahtzee', 'golf', 'hearts', 'custom'];

function get(type){
  return GAME_THEMES[type] || GAME_THEMES.custom;
}

window.GSK_Themes = { get, all: GAME_THEMES, PRESET_ORDER };
})();
