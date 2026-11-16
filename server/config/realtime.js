const { Server } = require('socket.io');
const { readSession } = require('./session');
const { chatScope, chatRoom } = require('../routes/chat');

module.exports = function configureRealtime(server, isAllowed) {
    const io = new Server(server, {
        cors: { origin: (origin, done) => done(null, isAllowed(origin)) },
        allowRequest: (request, done) => done(null, isAllowed(request.headers.origin)),
        maxHttpBufferSize: 8192
    });

    io.use(async (socket, next) => {
        try {
            const user = await readSession(socket.handshake.auth?.token);
            next(user ? undefined : new Error('Authentication required'));
        } catch {
            next(new Error('Connection could not be authenticated'));
        }
    });

    io.on('connection', socket => {
        let currentRoom;
        let subscribing = false;
        socket.on('chat-subscribe', async (input, acknowledge) => {
            if (typeof acknowledge !== 'function') return;
            if (subscribing) return acknowledge({ ok: false });
            subscribing = true;
            try {
                const user = await readSession(socket.handshake.auth?.token);
                if (!user) return socket.disconnect(true);
                if (currentRoom) await socket.leave(currentRoom);
                currentRoom = undefined;
                const scope = await chatScope(input || {}, user.id);
                currentRoom = chatRoom(scope);
                await socket.join(currentRoom);
                acknowledge({ ok: true });
            } catch {
                acknowledge({ ok: false });
            } finally {
                subscribing = false;
            }
        });
    });
    return io;
};
