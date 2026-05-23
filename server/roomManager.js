// Управление комнатами для онлайн-игры
class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom() {
    const id = Math.random().toString(36).substring(2, 10);
    this.rooms.set(id, { players: [], gameState: null });
    return id;
  }

  joinRoom(roomId, player) {
    const room = this.rooms.get(roomId);
    if (room && room.players.length < 2) {
      room.players.push(player);
      return true;
    }
    return false;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }
}

module.exports = RoomManager;
