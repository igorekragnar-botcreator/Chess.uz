const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: 8080 });
const rooms = new Map();

wss.on('connection', (ws) => {
  let roomId = null;
  let playerColor = null;

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    switch (msg.type) {
      case 'create_room':
        roomId = uuidv4().slice(0, 8);
        rooms.set(roomId, { white: ws, black: null, game: null });
        ws.send(JSON.stringify({ type: 'room_created', roomId, color: 'white' }));
        break;

      case 'join_room':
        const room = rooms.get(msg.roomId);
        if (room && !room.black) {
          room.black = ws;
          roomId = msg.roomId;
          room.white.send(JSON.stringify({ type: 'opponent_joined' }));
          ws.send(JSON.stringify({ type: 'joined', color: 'black' }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена или занята' }));
        }
        break;

      case 'move':
        const currentRoom = rooms.get(msg.roomId);
        if (currentRoom) {
          const opponent = currentRoom.white === ws ? currentRoom.black : currentRoom.white;
          if (opponent) {
            opponent.send(JSON.stringify({
              type: 'opponent_move',
              from: msg.from,
              to: msg.to,
              promotion: msg.promotion
            }));
          }
        }
        break;

      case 'resign':
        // Отправка сообщения о сдаче
        break;
    }
  });

  ws.on('close', () => {
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        const opponent = room.white === ws ? room.black : room.white;
        if (opponent) {
          opponent.send(JSON.stringify({ type: 'opponent_left' }));
        }
        rooms.delete(roomId);
      }
    }
  });
});

console.log('WebSocket сервер запущен на порту 8080');
