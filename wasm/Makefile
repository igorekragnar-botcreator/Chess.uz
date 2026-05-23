CC = emcc
CFLAGS = -O3 -s WASM=1 -s EXPORTED_FUNCTIONS='["_malloc","_free","_get_best_move_from_fen","_evaluate_position_from_fen","_init_engine"]' -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'

all: chess_engine.wasm

chess_engine.wasm: chess_engine.c
	$(CC) chess_engine.c -o chess_engine.wasm $(CFLAGS)

clean:
	rm -f chess_engine.wasm chess_engine.js

.PHONY: all clean
