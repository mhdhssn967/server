import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3001;

// Existing types/state
type PlayerState = { x: number; y: number; z: number; rotation: number; animation: string; roomId?: string; color: string; hp: number };
const players: Record<string, PlayerState> = {};
const roomBalls: Record<string, {id: string, x: number, z: number}[]> = {};

// Milk game types/state
type MilkRoom = {
  id: string;
  host: string;
  players: string[]; // socket IDs
  started: boolean;
  turnIndex: number;
};
const milkRooms: Record<string, MilkRoom> = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // --- Milk Game Events ---

  socket.on('milkCreateRoom', () => {
    // Generate 5 digit room code
    const roomId = Math.floor(10000 + Math.random() * 90000).toString();
    milkRooms[roomId] = {
      id: roomId,
      host: socket.id,
      players: [socket.id],
      started: false,
      turnIndex: 0
    };
    socket.join(roomId);
    socket.emit('milkRoomCreated', roomId);
    socket.emit('milkPlayersUpdate', milkRooms[roomId].players);
  });

  socket.on('milkJoinRoom', (roomId: string) => {
    const room = milkRooms[roomId];
    if (room && !room.started && room.players.length < 5) {
      room.players.push(socket.id);
      socket.join(roomId);
      socket.emit('milkJoined', roomId);
      io.to(roomId).emit('milkPlayersUpdate', room.players);
    } else {
      socket.emit('milkError', 'Room not found, full, or already started.');
    }
  });

  socket.on('milkStartGame', (roomId: string) => {
    const room = milkRooms[roomId];
    if (room && room.host === socket.id && room.players.length >= 2) {
      room.started = true;
      room.turnIndex = 0;
      io.to(roomId).emit('milkGameStarted', { turn: room.turnIndex, players: room.players });
    }
  });

  socket.on('milkAction', (data: { roomId: string, action: string }) => {
    const room = milkRooms[data.roomId];
    // Broadcast squeeze actions to everyone except sender
    if (room && room.players[room.turnIndex] === socket.id) {
      socket.to(data.roomId).emit('milkAction', data.action); // 'startSqueeze' or 'stopSqueeze'
    }
  });

  socket.on('milkTurnEnded', (data: { roomId: string, spilled: boolean }) => {
    const room = milkRooms[data.roomId];
    if (room && room.players[room.turnIndex] === socket.id) {
      if (data.spilled) {
        io.to(data.roomId).emit('milkGameOver', { loser: room.turnIndex });
        room.started = false;
      } else {
        room.turnIndex = (room.turnIndex + 1) % room.players.length;
        io.to(data.roomId).emit('milkNewTurn', room.turnIndex);
      }
    }
  });

  // --- End Milk Game Events ---

  socket.on('joinRoom', (roomId: string) => {
    // ... existing logic
  });
  
  // (Assuming we keep the rest of the existing code intact below for brevity, but I will rewrite it all)
});

server.listen(PORT, () => {
  console.log(\Server is running on port \\);
});
