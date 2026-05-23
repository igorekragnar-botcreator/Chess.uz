/**
 * WebAssembly обёртка для Chess AI Engine
 * Использование:
 *   const engine = await ChessEngine.init();
 *   const move = engine.getBestMove(fen, 4);
 */

class ChessEngine {
    constructor() {
        this.instance = null;
        this.ready = false;
    }

    static async init(wasmPath = 'wasm/chess_engine.wasm') {
        const engine = new ChessEngine();
        
        const response = await fetch(wasmPath);
        const bytes = await response.arrayBuffer();
        
        const result = await WebAssembly.instantiate(bytes, {
            env: {
                printf: (ptr) => console.log("WASM:", ptr),
                abort: () => console.log("WASM abort")
            }
        });
        
        engine.instance = result.instance;
        engine.ready = true;
        
        // Инициализация движка
        engine.instance.exports.init_engine();
        
        return engine;
    }

    // Получить лучший ход (возвращает { from, to })
    getBestMove(fen, depth = 4) {
        if (!this.ready) {
            console.error("Engine not ready");
            return null;
        }

        // Копируем строку FEN в память WASM
        const encoder = new TextEncoder();
        const fenBytes = encoder.encode(fen + '\0');
        const fenPtr = this.instance.exports.malloc(fenBytes.length);
        
        const memory = new Uint8Array(this.instance.exports.memory.buffer);
        memory.set(fenBytes, fenPtr);
        
        // Вызываем WASM функцию
        const result = this.instance.exports.get_best_move_from_fen(fenPtr, depth);
        
        // Освобождаем память
        this.instance.exports.free(fenPtr);
        
        const from = (result >> 8) & 0xFF;
        const to = result & 0xFF;
        
        if (from === -1 || to === -1) return null;
        
        // Конвертируем индексы в шахматную нотацию
        const fromSq = indexToSquare(from);
        const toSq = indexToSquare(to);
        
        return { from: fromSq, to: toSq };
    }

    // Оценить позицию
    evaluatePosition(fen) {
        if (!this.ready) return 0;
        
        const encoder = new TextEncoder();
        const fenBytes = encoder.encode(fen + '\0');
        const fenPtr = this.instance.exports.malloc(fenBytes.length);
        
        const memory = new Uint8Array(this.instance.exports.memory.buffer);
        memory.set(fenBytes, fenPtr);
        
        const score = this.instance.exports.evaluate_position_from_fen(fenPtr);
        
        this.instance.exports.free(fenPtr);
        
        return score;
    }
}

// Конвертация индекса (0-63) в шахматную нотацию (a1-h8)
function indexToSquare(index) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const rank = Math.floor(index / 8);
    const file = index % 8;
    return files[file] + (rank + 1);
}

// Конвертация шахматной нотации в индекс
function squareToIndex(square) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
    return rank * 8 + file;
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChessEngine, indexToSquare, squareToIndex };
}
