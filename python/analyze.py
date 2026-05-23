#!/usr/bin/env python3
"""
Анализ шахматных партий через Stockfish
Используется для улучшения книги дебютов
"""

import chess
import chess.pgn
import chess.engine
import json
import os

STOCKFISH_PATH = "/usr/games/stockfish"  # путь к Stockfish
PGN_FILE = "openings.pgn"
OUTPUT_FILE = "opening_book.json"

def analyze_opening(pgn_file, depth=20):
    """Анализирует все партии из PGN и сохраняет лучшие ходы"""
    
    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
    opening_book = {}
    
    with open(pgn_file) as f:
        while True:
            game = chess.pgn.read_game(f)
            if game is None:
                break
            
            board = game.board()
            for move in game.mainline_moves():
                fen_key = board.fen().split(' ')[:3]
                key = ' '.join(fen_key)
                
                # Анализируем позицию
                info = engine.analyse(board, chess.engine.Limit(depth=depth))
                score = info['score'].white().score()
                
                if key not in opening_book:
                    opening_book[key] = []
                
                opening_book[key].append({
                    'move': move.uci(),
                    'score': score,
                    'popularity': 1
                })
                
                board.push(move)
    
    engine.quit()
    
    # Сортируем ходы по популярности
    for key in opening_book:
        moves = {}
        for m in opening_book[key]:
            if m['move'] not in moves:
                moves[m['move']] = {'score': 0, 'cnt': 0}
            moves[m['move']]['score'] += m['score']
            moves[m['move']]['cnt'] += 1
        
        opening_book[key] = [
            {'move': mv, 'score': d['score']/d['cnt']}
            for mv, d in moves.items()
        ]
        opening_book[key].sort(key=lambda x: x['score'], reverse=True)
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(opening_book, f, indent=2)
    
    print(f"Сохранено {len(opening_book)} позиций в {OUTPUT_FILE}")

if name == "main":
    analyze_opening()
