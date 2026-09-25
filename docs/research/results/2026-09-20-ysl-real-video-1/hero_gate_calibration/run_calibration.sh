S08=cuts/S08_master_69.466-76.368.mp4; S06=cuts/S06_master_61.597-68.499.mp4; S11=cuts/S11_master_79.302-86.204.mp4
python3 scripts/qa/hero_gate.py --anchor heroes/anchor_hook_s11_f0080.jpg --anchor-master heroes/anchor_hook_master_s11_f0080.jpg --source "$S08#86" \
 --candidate "A_source_f86=$S08#86" --candidate "B_E1_f86=gfx/s08_e1_graphic_hem3.mp4#86" --candidate "B_E1_f22=gfx/s08_e1_graphic_hem3.mp4#22@$S08#22" --candidate "B_E1_f146=gfx/s08_e1_graphic_hem3.mp4#146@$S08#146" --candidate "B_E1_S11_f40=s11_e1.mp4#40@$S11#40" \
 --candidate "C_E2_f6=heroes/S06/stills/S06_f0006.jpg@$S06#6" --candidate "C_E2_f18=heroes/S06/stills/S06_f0018.jpg@$S06#18" --candidate "C_E2_f30=heroes/S06/stills/S06_f0030.jpg@$S06#30" --candidate "C_E2_f78=heroes/S06/stills/S06_f0078.jpg@$S06#78" --candidate "C_E2_f114=heroes/S06/stills/S06_f0114.jpg@$S06#114" \
 --candidate "D_wrong_frame_f0=$S08#0" --candidate "D_wrong_shot_anchor=heroes/anchor_hook_s11_f0080.jpg" \
 --candidate "E_anchor=heroes/anchor_hook_s11_f0080.jpg@heroes/anchor_hook_master_s11_f0080.jpg" --candidate "F_aleph_f86=runway_s08/s08_aleph.mp4#86" \
 --expect archc/hero_gate_expect.json --out "$1" 2>&1 2>&1 | grep -v "^W0000\|^INFO\|absl\|Exception ignored\|TypeError"
