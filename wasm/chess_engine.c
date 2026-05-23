// AI движок на C для компиляции в WebAssembly
#include <stdio.h>
#include <stdlib.h>

#define INF 100000
#define DEPTH 6

typedef struct {
    int from_row, from_col;
    int to_row, to_col;
    int score;
} Move;

int piece_values[6] = {100, 320, 330, 500, 900, 0}; // p, n, b, r, q, k

int evaluate_board(int board[8][8]) {
    int score = 0;
    for (int r = 0; r < 8; r++) {
        for (int c = 0; c < 8; c++) {
            int piece = board[r][c];
            if (piece != 0) {
                int sign = (piece > 0) ? 1 : -1;
                int type = abs(piece) - 1;
                score += sign * piece_values[type];
            }
        }
    }
    return score;
}

int minimax(int board[8][8], int depth, int alpha, int beta, int is_max) {
    if (depth == 0) {
        return evaluate_board(board);
    }
    
    // Здесь должна быть генерация ходов
    // Упрощённо: просто возвращаем оценку
    
    if (is_max) {
        int max_score = -INF;
        // Перебираем ходы
        // max_score = max(max_score, minimax(...))
        return max_score;
    } else {
        int min_score = INF;
        return min_score;
    }
}

// Функция, доступная из JavaScript
Move get_best_move(int board[8][8]) {
    Move best_move = {0};
    best_move.score = minimax(board, DEPTH, -INF, INF, 1);
    return best_move;
}
