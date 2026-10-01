#!/bin/bash
cd /tmp/avt-main-build; Y=/tmp/claude-0/-home-claude/12ba9676-4e1a-539a-95e3-7f886da01d75/scratchpad/ysl; M=$Y/cam/S11_matte; P=$Y/plates/hook_dev.jpg; D=$Y/plates/hook_dev_depth.png; AU=$Y/cuts/S11_master_79_302-86_204_1789946049483_hgq7cp.mp4
run(){ python3 scripts/edit/camera_engine.py --matte-dir $M --plate $P --plate-depth $D --spec "$2" --out $Y/cam/mv_$1.mp4 --audio $AU --range 0:96 --label "$3" > $Y/cam/mv_$1.log 2>&1 && echo "ok $1" >> $Y/cam/moves.out; }
run 01_push '{"move":{"type":"push","amount":0.16},"lens":"anamorphic_35"}' "slow push - anamorphic 35"
run 02_hero '{"move":{"type":"push","amount":0.22,"ease":"in"},"lens":"anamorphic_35","angle":{"keystone":0.07}}' "low-angle hero push - anamorphic 35"
run 03_slider '{"move":{"type":"truck","amount":0.10,"direction":"right"},"lens":"portrait_85"}' "slider glide - 85 portrait"
run 04_crane '{"move":{"type":"crane","amount":0.12,"direction":"down"},"lens":"clean_50"}' "crane descend - 50 clean"
run 05_orbit '{"move":{"type":"orbit","amount":0.14,"direction":"left"},"lens":"portrait_85"}' "orbit parallax - 85 portrait"
run 06_whip '{"move":{"type":"whip_pan","amount":0.9,"direction":"right","ease":"snap","start":0.0,"end":0.22},"lens":"handheld_24","handheld":0.5}' "whip-pan reframe - handheld 24"
run 07_dollyzoom '{"move":{"type":"dolly_zoom","amount":0.35},"lens":"anamorphic_35"}' "dolly zoom - anamorphic 35"
run 08_macro '{"move":{"type":"static"},"lens":"macro_locked","framing":{"scale":1.35,"y":-0.12}}' "locked macro reframe - 100 macro"
echo DONE > $Y/cam/MOVES_DONE
