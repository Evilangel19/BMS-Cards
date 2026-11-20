// @ts-check
// The cards of the kneeboard are drawn at 1600 x 2400 and go into a page of 1024 x 2048 of the BMS texture (0.64 of their size), which in the cockpit is
// often seen through a mipmap of half or a quarter of that. So their small text is raised (kbPx: up to 24 px it comes halfway up to 24) and their
// greys and thin lines are darker and thicker than on a screen (the colours below and a line of at least 2 px).
export const kbPx = s => (s >= 24 ? s : Math.round(24 - (24 - s) * 0.5));
export const kbLw = w => Math.max(2, w);
