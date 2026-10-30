// Starter prompt bank. Pre-written prompts are OUR speech (Section 230 doesn't cover them), so they stay
// PG-13: future, observable, harmless. Nothing sexual, no drugs/crime/health, nothing about anyone's identity.
// {n} = the person's name. close: tonight | tomorrow | weekend | week
export const PROMPTS = {
  Tonight: {
    person: [['Will {n} be the first to leave?', 'tonight'], ['Will {n} text their ex?', 'tonight'], ['Will {n} get home before 2am?', 'tonight'],
      ['Will {n} sing at karaoke?', 'tonight'], ['Will {n} kiss someone tonight?', 'tonight'], ['Will {n} lose their phone or keys?', 'tonight'],
      ['Will {n} order food after midnight?', 'tonight'], ['Will {n} get a phone number?', 'tonight'], ['Will {n} start a dance circle?', 'tonight']],
    group: [['Will we end up at a second spot?', 'tonight'], ['Will anyone fall asleep before midnight?', 'tonight'], ['Will the group chat name change tonight?', 'tonight'],
      ['Will we be out past 2am?', 'tonight']],
  },
  'Game day': {
    person: [['Will {n} wear a jersey?', 'tomorrow'], ['Will {n} yell at the TV?', 'tomorrow'], ['Will {n} leave before the 4th quarter?', 'tomorrow'],
      ['Will {n} call the final score exactly?', 'tomorrow']],
    group: [['Will the game go to overtime?', 'tomorrow'], ['Will the home team cover?', 'tomorrow'], ['Will someone spill a drink on the couch?', 'tomorrow'],
      ['Will there be a pick-six?', 'tomorrow']],
  },
  Trip: {
    person: [['Will {n} miss the flight?', 'week'], ['Will {n} get sunburnt on day 1?', 'week'], ['Will {n} lose their passport?', 'week'],
      ['Will {n} buy a souvenir hat?', 'week'], ['Will {n} sleep through breakfast every day?', 'week'], ['Will {n} get a tattoo on the trip?', 'week']],
    group: [['Will we make the first flight?', 'week'], ['Will it rain on the beach day?', 'week'], ['Will we go over budget?', 'week'],
      ['Will someone get left at the bar?', 'week']],
  },
  Work: {
    person: [['Will {n} be late to standup?', 'tomorrow'], ['Will {n} reply-all by accident?', 'week'], ['Will {n} bring donuts this week?', 'week'],
      ['Will {n} take a nap at their desk?', 'week'], ['Will {n} say "circle back"?', 'tomorrow']],
    group: [['Will the meeting run over?', 'tomorrow'], ['Will the coffee machine break this week?', 'week'], ['Will Friday get an early dismissal?', 'weekend']],
  },
  Home: {
    person: [['Will {n} do the dishes tonight?', 'tonight'], ['Will {n} take out the trash without being asked?', 'week'], ['Will {n} finish the leftovers?', 'tomorrow'],
      ['Will {n} actually clean their room?', 'weekend'], ['Will {n} binge a whole season this weekend?', 'weekend']],
    group: [['Will the wifi go out this week?', 'week'], ['Will we order takeout again tonight?', 'tonight'], ['Will the plant survive the week?', 'week']],
  },
  Dating: {
    person: [['Will {n} go on a second date?', 'week'], ['Will {n} text them back tonight?', 'tonight'], ['Will {n} make it official this month?', 'week'],
      ['Will {n} delete the dating apps this week?', 'week'], ['Will {n} get left on read?', 'tomorrow']],
    group: [['Will anyone bring a date to the party?', 'weekend']],
  },
  Fitness: {
    person: [['Will {n} hit the gym tomorrow?', 'tomorrow'], ['Will {n} run 5 miles this week?', 'week'], ['Will {n} skip leg day?', 'week'],
      ['Will {n} make it to the 6am class?', 'tomorrow'], ['Will {n} drink 8 glasses of water tomorrow?', 'tomorrow']],
    group: [['Will we all show up to pickup ball?', 'weekend']],
  },
  Random: {
    person: [['Will {n} change their profile pic this week?', 'week'], ['Will {n} cut their hair this week?', 'week'], ['Will {n} post a story tonight?', 'tonight'],
      ['Will {n} cook dinner instead of ordering?', 'tonight'], ['Will {n} finish the book this month?', 'week'], ['Will {n} buy something they don\'t need?', 'weekend']],
    group: [['Will it snow this week?', 'week'], ['Will the group chat hit 100 messages today?', 'tomorrow'], ['Will we actually make plans for Saturday?', 'weekend']],
  },
};
export const CATS = Object.keys(PROMPTS);
export function suggestions(cat, subjectName, isMe, n = 6, seed = 0) {
  const kind = subjectName ? 'person' : 'group';
  let list = PROMPTS[cat][kind].length ? PROMPTS[cat][kind] : PROMPTS[cat].person;
  if (!subjectName && kind === 'person') list = [];
  const filled = list.map(([t, close]) => {
    let q = t;
    if (subjectName) q = isMe ? t.replace('Will {n}', 'Will I').replace(/\btheir\b/g, 'my').replace(/\bthem\b/g, 'them') : t.replace('{n}', subjectName);
    return { q, close };
  });
  const out = []; for (let i = 0; i < filled.length && out.length < n; i++) out.push(filled[(i + seed) % filled.length]);
  return out;
}
