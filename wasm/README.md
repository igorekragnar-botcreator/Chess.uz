# WASM Chess Engine

## Компиляция

Установите Emscripten: https://emscripten.org/docs/getting_started/downloads.html

```bash
emcc chess_engine.c -o chess_engine.wasm -O3 \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_malloc","_free","_get_best_move_from_fen","_evaluate_position_from_fen","_init_engine"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'
