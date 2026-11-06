// Radio presets of the DTC (core/radioplan.js): the rules of BMS, checked on the flights of EvilKorea that a pilot compared with the Data Cartridge of the game.
import fs from 'node:fs';
import { CAM } from '../app/js/core/cam-core.js';
import { buildAto } from '../app/js/core/ato.js';
import { khz, ownIndex, radioPlan, radioEdits } from '../app/js/core/radioplan.js';
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const plan = F => Object.fromEntries(radioPlan(F).map(p => [p.k, p.v]));

// ---- the pieces
ck(
  'khz: MHz as the card shows them -> kHz of the DTC',
  khz('276.675') === '276675' && khz('143.8') === '143800' && khz(' 36.750 ') === '36750'
);
ck(
  'khz: a comma works, what is no frequency gives nothing',
  khz('283,300') === '283300' && khz('') === '' && khz('---') === '' && khz(undefined) === '' && khz('0') === ''
);
ck(
  'ownIndex: the package flight with the callsign of the card',
  ownIndex({ cs: 'Gator 7', pk0_0: 'Hammer 7', pk1_0: 'Gator 7' }) === 1
);
ck(
  'ownIndex: not in the package table, or no callsign: -1',
  ownIndex({ cs: 'X 1', pk0_0: 'Y 1' }) === -1 && ownIndex({ pk0_0: 'Y 1' }) === -1
);

// ---- the rules on a made-up card (own flight is the second of the package)
{
  const F = {
    cs: 'Gator 7',
    pk0_0: 'Hammer 7',
    pk0_2: '276.675',
    pk0_3: '143.800',
    pk1_0: 'Gator 7',
    pk1_2: '312.275',
    pk1_3: '36.750',
    pk2_0: '---',
    pk2_2: '---',
    pk2_3: '---',
    su0_2: '330.100',
    su0_v: '45.225',
    su2_2: '283.300',
    su2_v: '47.100',
    rd_u15: '283.750',
  };
  const p = plan(F);
  ck(
    '6 is the own flight (UHF and VHF), whichever place it has in the package',
    p.UHF_6 === '312275' && p.VHF_6 === '36750'
  );
  ck(
    '13 is the first tanker, 5 the AWACS',
    p.UHF_13 === '330100' && p.VHF_13 === '45225' && p.UHF_5 === '283300' && p.VHF_5 === '47100'
  );
  ck('UHF 15 is the intra-flight UHF of the first flight', p.UHF_15 === '283750');
  ck(
    'VHF 15, 16: the flights of the package in the order of the card; an empty row gives nothing',
    p.VHF_15 === '143800' && p.VHF_16 === '36750' && !('VHF_17' in p)
  );
  ck('nothing for UHF 16 and over (not known)', !Object.keys(p).some(k => /^UHF_(1[6-9]|20)$/.test(k)));
  const q = plan({ cs: 'Gator 7', pk1_0: 'Gator 7', pk1_2: '312.275', pk1_3: '36.750' });
  ck(
    'no tanker, no AWACS: presets 5 and 13 are left alone',
    !('UHF_5' in q) && !('UHF_13' in q) && !('VHF_13' in q) && q.UHF_6 === '312275'
  );
}

// ---- the lines
{
  const have = { UHF_6: '276675', UHF_13: '340350', UHF_15: '', VHF_6: '143800' };
  const e = radioEdits(
    [
      { k: 'UHF_6', v: '276675' },
      { k: 'UHF_13', v: '330100' },
      { k: 'UHF_15', v: '283750' },
      { k: 'VHF_6', v: '143800' },
      { k: 'VHF_16', v: '36750' },
    ],
    k => (k in have ? have[k] : null)
  );
  ck(
    'only the presets that change are written (6 is the same, 13 and 15 change)',
    e.length === 2 && e[0].k === 'UHF_13' && e[0].v === '330100' && e[1].k === 'UHF_15'
  );
  ck('a preset that is not in the file is not added (VHF_16)', !e.some(x => x.k === 'VHF_16'));
  ck(
    'the lines are in the section [Radio]',
    e.every(x => x.s === 'Radio')
  );
  ck(
    'the same frequency written another way counts as the same (276.675 MHz as 276675 or 0276675)',
    radioEdits([{ k: 'UHF_6', v: '276675' }], () => '0276675').length === 0
  );
}

// ---- EvilKorea: the numbers a pilot read on the Data Cartridge of BMS for Hammer 7 (package 2525): 5 = 283.300, 6 = 276.675, 13 = 330.100, UHF 15 = 283.750
{
  const d = new URL('./fixtures/evilkorea/', import.meta.url);
  const C = CAM.openCam(new Uint8Array(fs.readFileSync(new URL('EvilKorea.cam', d))), CAM.D, 'EvilKorea.cam');
  const A = buildAto(C, null);
  const card = cs => CAM.fillCard(C, A.find(e => e.callsign === cs).f, 0);
  const F = card('Hammer 7'),
    p = plan(F);
  ck(
    'Hammer 7: UHF 5, 6, 13 and 15 are the ones of BMS (283.300, 276.675, 330.100, 283.750)',
    p.UHF_5 === '283300' && p.UHF_6 === '276675' && p.UHF_13 === '330100' && p.UHF_15 === '283750'
  );
  ck(
    'Hammer 7: VHF 6 is its own VHF (143.800), the same as VHF 15 (the first flight of the package); VHF 16 is Gator 7 (36.750)',
    p.VHF_6 === '143800' && p.VHF_15 === '143800' && p.VHF_16 === '36750'
  );
  ck(
    'Hammer 7: the VHF of the AWACS (Sentry6, 47.100) and of the tanker (Texaco7, 45.225)',
    p.VHF_5 === '47100' && p.VHF_13 === '45225'
  );
  ck(
    'the card keeps the hidden keys: VHF of the supports and the UHF2 of the first flight',
    F.su0_v === '45.225' && F.su2_v === '47.100' && F.rd_u15 === '283.750'
  );
  const P5 = plan(card('Plasma 5'));
  ck(
    'Plasma 5 (it is the first flight of its package): UHF 15 is its own backup, VHF 15 its own VHF',
    P5.UHF_15 === '233425' && P5.VHF_15 === P5.VHF_6 && P5.UHF_6 === '229675'
  );
}
console.log(bad ? `${bad} of ${n} FAILED` : `OK - ${n} radio checks`);
process.exit(bad ? 1 : 0);
