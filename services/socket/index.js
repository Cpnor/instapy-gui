// TODO split this service up in different files
var Docker = require('dockerode');
var docker = null;
var filesystem = process.env.FILESYSTEM;

if	(filesystem && filesystem == 'windows') {
	docker = new Docker({
		host: 'host.docker.internal',
		port: 2375,
		protocol: 'https'
	});
} else {
	docker = new Docker({ socketPath: '/var/run/docker.sock' });
}

const USERS = [];

class bot_handler {
	constructor() {
		this.messages = [];
		this.running = false;
		// exited, loading, running
		this.status = 'exited';
		this.containerID = null;
		this.namespace = '';
		this.clicked = false;

		const containers = docker.listContainers({ all: true }).then(this.findContainer.bind(this));
		setInterval(this.checkContainerStatus.bind(this), 2000);
		setInterval(this.ping.bind(this), 3000);
	}

	ping() {
		const ping = {
			handler: 'ping',
			action: 'send'
		};

		const stringPing = JSON.stringify(ping);

		this.sendAll(stringPing);
	}

	sendAll(message) {
		for (let user of USERS) {
			try {
				user.send(message);
			} catch (e) {
				console.error('sending message to websocket');
				console.error(e);
			}
		}
	}

	checkContainerStatus() {
		if (!this.containerID) return;
		if (this.clicked) return;

		const container = docker.getContainer(this.containerID);
		container.inspect().then(con => {
			const state = con.State;

			let changed = false;
			if (this.running != state.Running) {
				this.running = state.Running;
				changed = true;
			}

			if (this.status != state.Status) {
				this.status = state.Status;
				changed = true;
			}

			if (changed) this.statusChanged();
		});
	}

	findContainer(containers) {
		for (let container of containers) {
			if (container.Image != 'felixbreuer/instapy' &&
				container.Image != 'felixbreuer/instapy:latest') continue;

			this.containerID = container.Id;
			console.log('container found!');
			return;
		}

		console.error('container could not be found');
		process.exit(1);
	}

	messageReceived(message) {
		this.messages.push(message.message);

		// delete first 100 elements if too many messages
		if (this.messages.length > 1000) this.messages = this.messages.slice(-900);

		const log = {
			handler: 'logger',
			action: 'single',
			message: message.message
		};

		const stringLog = JSON.stringify(log);
		this.sendAll(stringLog);
	}

	start(namespace) {
		if (this.running) return;
		if (this.clicked) return;
		if (!this.containerID) return;
		if (this.status != 'exited') return;

		this.status = 'loading';
		this.clicked = true;
		this.running = false;
		this.namespace = namespace;
		// clear logs
		this.messages = [];

		this.statusChanged();
		const container = docker.getContainer(this.containerID);
		container.start().then(() => {
			this.running = false;
			this.status = 'loading';
			// wait for the next status update to get new status
			this.clicked = false;
			this.statusChanged();
		});
	}

	statusChanged() {
		const status = {
			handler: 'bot_state',
			action: 'set',
			running: this.running,
			status: this.status
		};

		const stringStatus = JSON.stringify(status);
		this.sendAll(stringStatus);
	}

	stop() {
		this.running = true;
		this.status = 'loading';
		this.clicked = true;
		this.namespace = '';

		const container = docker.getContainer(this.containerID);
		try {
			container.stop({ t: 10 }).then(() => {
				this.status = 'loading';
				this.running = true;
				this.namespace = '';
				// wait for next status update to get new status
				this.clicked = false;
				this.statusChanged();
			});
		} catch (e) {
			this.status = 'error';
			this.running = false;
			this.namespace = '';
			this.clicked = false;
			this.statusChanged();
		}
	}

	getStatus() {
		return {
			running: this.running,
			status: this.status
		};
	}

	getMessages() {
		return this.messages;
	}

	getNamespace() {
		return this.namespace;
	}
}

// bot handler singleton
const botHandler = new bot_handler();

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 80 });

function botStateHandler(data, socket) {
	if (data.action == 'get') {
		const org_stat = botHandler.getStatus();

		const status = {
			handler: 'bot_state',
			running: org_stat.running,
			status: org_stat.status
		};

		socket.send(JSON.stringify(status));
		return;
	}

	if (data.action == 'toggle') {
		data.running ? botHandler.start(data.namespace) : botHandler.stop();
		return;
	}
}

function loggerHandler(data, socket) {
	if (data.action == 'get') {
		const logs = {
			handler: 'logger',
			action: 'multiple',
			message: botHandler.getMessages()
		};

		socket.send(JSON.stringify(logs));
		return;
	}
}

function namespaceHandler(data, socket) {
	if (data.action == 'get') {
		const message = {
			handler: 'namespace',
			action: 'set',
			namespace: botHandler.getNamespace()
		};

		socket.send(JSON.stringify(message));
		return;
	}
}

function instapyHandler(data, socket) {
	botHandler.messageReceived(data);
}

wss.on('connection', function connection(ws) {
	USERS.push(ws);

	ws.on('message', function incoming(data) {
		data = JSON.parse(data);
		if (data.handler == 'bot_state') {
			botStateHandler(data, ws);
			return;
		}

		if (data.handler == 'logger') {
			loggerHandler(data, ws);
			return;
		}

		if (data.handler == 'namespace') {
			namespaceHandler(data, ws);
			return;
		}

		if (data.handler == 'instapy') {
			instapyHandler(data, ws);
			return;
		}
	});

	ws.on('close', function closing() {
		var index = USERS.indexOf(ws);
		if (index > -1) {
			USERS.splice(index, 1);
		}
	});
});
