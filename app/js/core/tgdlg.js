// the windows that choose Kneeboard cards on their pictures (.tgdlg: Target, SEAD, DEAD, Weather, Add all cards): a button that chooses them all, or none
// (it clicks the cards that differ, so each window counts them as when clicked by hand)
export function pickAll(d) {
  const bar = d.querySelector('.tgbar'),
    cards = () => [...d.querySelectorAll('.tgcard')];
  if (!bar || cards().length < 2) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn g tgall';
  const all = () => cards().every(c => c.classList.contains('on')),
    label = () => (b.textContent = all() ? 'Select none' : 'Select all');
  b.onclick = () => {
    const on = !all();
    cards().forEach(c => {
      if (c.classList.contains('on') != on) c.click();
    });
    label();
  };
  d.querySelector('.tgcards').addEventListener('click', () => setTimeout(label));
  bar.prepend(b);
  label();
}
