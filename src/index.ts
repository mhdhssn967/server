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

const OUTFIT_COLORS = [
  '#FF5733', // Vibrant Red-Orange
  '#33FF57', // Bright Green
  '#3357FF', // Bright Blue
  '#F333FF', // Hot Pink
  '#33FFF3', // Cyan
  '#FFD133', // Yellow
  '#8A33FF', // Purple
  '#FF3380', // Rose
  '#A0FF33', // Lime
  '#333333'  // Dark Gray
];

type PlayerState = { x: number; y: number; z: number; rotation: number; animation: string; roomId?: string; color: string; hp: number };
const players: Record<string, PlayerState> = {};
const roomBalls: Record<string, {id: string, x: number, z: number}[]> = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', (roomId: string) => {
    socket.join(roomId);
    
    const usedColors = new Set<string>();
    for (const id in players) {
      if (players[id].roomId === roomId) {
        usedColors.add(players[id].color);
      }
    }
    
    const availableColors = OUTFIT_COLORS.filter(c => !usedColors.has(c));
    const assignedColor = availableColors.length > 0 
      ? availableColors[Math.floor(Math.random() * availableColors.length)]
      : OUTFIT_COLORS[Math.floor(Math.random() * OUTFIT_COLORS.length)];

    players[socket.id] = { x: 0, y: 0, z: 0, rotation: 0, animation: 'idle', roomId, color: assignedColor, hp: 100 };
    
    const roomPlayers: Record<string, PlayerState> = {};
    for (const id in players) {
      if (players[id].roomId === roomId) {
        roomPlayers[id] = players[id];
      }
    }
    
    socket.emit('currentPlayers', roomPlayers);
    socket.to(roomId).emit('newPlayer', { id: socket.id, position: players[socket.id] });
    console.log(`User ${socket.id} joined room ${roomId} with color ${assignedColor}`);
    
    if (!roomBalls[roomId]) {
      roomBalls[roomId] = Array.from({length: 20}).map(() => ({
        id: Math.random().toString(36).substring(2, 9),
        x: Math.random() * 40 - 20,
        z: Math.random() * 40 - 20
      }));
    }
    socket.emit('initBalls', roomBalls[roomId]);
  });

  socket.on('pickupBall', (ballId: string) => {
    const player = players[socket.id];
    if (player && player.roomId && roomBalls[player.roomId]) {
      const rb = roomBalls[player.roomId];
      const idx = rb.findIndex(b => b.id === ballId);
      if (idx >= 0) {
        rb.splice(idx, 1);
        io.to(player.roomId).emit('ballPickedUp', { ballId, playerId: socket.id });
      }
    }
  });

  socket.on('playerHit', (data: { damage: number }) => {
    const player = players[socket.id];
    if (player && player.roomId) {
      player.hp -= data.damage;
      if (player.hp <= 0) {
        io.to(socket.id).emit('kicked');
        socket.to(player.roomId).emit('playerDisconnected', socket.id);
        socket.leave(player.roomId);
        delete players[socket.id];
      } else {
        io.to(player.roomId).emit('playerUpdated', { id: socket.id, player });
      }
    }
  });

  socket.on('ballLanded', (pos: {x:number, z:number}) => {
    const player = players[socket.id];
    if (player && player.roomId && roomBalls[player.roomId]) {
      const newBall = {
        id: Math.random().toString(36).substring(2, 9),
        x: pos.x,
        z: pos.z
      };
      roomBalls[player.roomId].push(newBall);
      io.to(player.roomId).emit('spawnBall', newBall);
    }
  });

  socket.on('playerMovement', (movementData: PlayerState) => {
    const player = players[socket.id];
    if (player && player.roomId) {
      players[socket.id] = { ...movementData, roomId: player.roomId, color: player.color, hp: player.hp };
      socket.to(player.roomId).emit('playerMoved', { id: socket.id, position: players[socket.id] });
    }
  });

  socket.on('throwBall', (ballData: { startPos: {x:number, y:number, z:number}, velocity: {x:number, y:number, z:number} }) => {
    const player = players[socket.id];
    if (player && player.roomId) {
      const ballId = Math.random().toString(36).substring(2, 9);
      io.to(player.roomId).emit('newBall', { id: ballId, ...ballData });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const player = players[socket.id];
    if (player && player.roomId) {
      socket.to(player.roomId).emit('playerDisconnected', socket.id);
    }
    delete players[socket.id];
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
