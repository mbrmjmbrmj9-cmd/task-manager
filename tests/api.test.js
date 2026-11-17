const http = require('node:http');
const { Duplex } = require('node:stream');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { Types } = require('mongoose');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nivora-test-'));
process.env.PRIVATE_UPLOAD_DIR = temp;
process.env.JWT_SECRET = randomBytes(48).toString('base64url');

const { createApp } = require('../server/server');
const { issueSession } = require('../server/config/session');
const User = require('../server/models/User');
const Workspace = require('../server/models/Workspace');
const Organization = require('../server/models/Organization');
const Project = require('../server/models/Project');
const Task = require('../server/models/Task');
const File = require('../server/models/File');
const Message = require('../server/models/Message');
const Notification = require('../server/models/Notification');
const Workflow = require('../server/models/Workflow');
const Template = require('../server/models/Template');
const Ticket = require('../server/models/Ticket');

const server = http.createServer(createApp());
const id = () => new Types.ObjectId();

class TestSocket extends Duplex {
    constructor(data) {
        super();
        this.data = data;
        this.remoteAddress = '127.0.0.1';
        this.response = [];
    }

    _read() {
        if (this.data) {
            const data = this.data;
            this.data = null;
            this.push(data);
        }
    }

    _write(chunk, _encoding, done) {
        this.response.push(Buffer.from(chunk));
        done();
    }

    setTimeout() {}
    setNoDelay() {}
    setKeepAlive() {}
}

function request(method, route, { principal, token, body, bytes, contentType } = {}) {
    const data = bytes || (body !== undefined ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0));
    const headers = [
        method + ' ' + route + ' HTTP/1.1', 'Host: localhost', 'Connection: close',
        'Content-Length: ' + data.length
    ];
    if (data.length) headers.push('Content-Type: ' + (contentType || 'application/json'));
    const auth = token || (principal && issueSession(principal));
    if (auth) headers.push('Authorization: Bearer ' + auth);
    return new Promise((resolve, reject) => {
        const socket = new TestSocket(Buffer.concat([Buffer.from(headers.join('\r\n') + '\r\n\r\n'), data]));
        const timeout = setTimeout(() => socket.destroy(new Error('Timed out: ' + method + ' ' + route)), 4000);
        socket.on('error', error => { clearTimeout(timeout); reject(error); });
        socket.on('finish', () => {
            clearTimeout(timeout);
            const response = Buffer.concat(socket.response);
            const separator = response.indexOf('\r\n\r\n');
            const head = response.subarray(0, separator).toString('utf8');
            const raw = response.subarray(separator + 4);
            const status = Number(head.split(' ')[1]);
            resolve({ status, headers: head, body: head.includes('application/json') && raw.length ? JSON.parse(raw) : raw });
        });
        server.emit('connection', socket);
    });
}

function query(value) {
    return {
        select() { return this; }, sort() { return this; }, limit() { return this; }, skip() { return this; },
        lean: async () => value,
        then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
    };
}

let owner, member, outsider, manager, workspace, otherWorkspace, project, task, entities;

function record(model, records) {
    jest.spyOn(model, 'findById').mockImplementation(identifier => query(records.get(String(identifier)) || null));
}

function document(model, fields) {
    const instance = new model(fields);
    instance.save = jest.fn().mockResolvedValue(instance);
    instance.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
    return instance;
}

beforeEach(() => {
    owner = new User({ _id: id(), username: 'owner@example.test', fullName: 'مالك', password: bcrypt.hashSync('correct-password', 4) });
    member = new User({ _id: id(), username: 'member@example.test', fullName: 'عضو', password: 'disabled-test-value' });
    outsider = new User({ _id: id(), username: 'outside@example.test', password: 'disabled-test-value' });
    manager = new User({ _id: id(), username: 'admin@example.test', role: 'super_admin', password: 'disabled-test-value' });

    workspace = document(Workspace, { name: 'الفريق الأول', ownerId: owner.id, inviteCode: '0123456789ABCDEF',
        members: [{ userId: owner.id, role: 'owner' }, { userId: member.id, role: 'member' }] });
    otherWorkspace = document(Workspace, { name: 'الفريق الآخر', ownerId: outsider.id,
        members: [{ userId: outsider.id, role: 'owner' }] });
    project = document(Project, { name: 'المشروع الأول', workspaceId: workspace.id, userId: owner.id });
    task = document(Task, { title: 'مهمة الفريق', projectId: project.id, workspaceId: workspace.id, userId: owner.id,
        assigneeId: member.id, assignee: member.fullName });
    entities = {
        users: new Map([owner, member, outsider, manager].map(user => [user.id, user])),
        workspaces: new Map([workspace, otherWorkspace].map(workspace => [workspace.id, workspace])),
        projects: new Map([[project.id, project]]),
        tasks: new Map([[task.id, task]])
    };
    record(User, entities.users);
    record(Workspace, entities.workspaces);
    record(Project, entities.projects);
    record(Task, entities.tasks);
    jest.spyOn(Organization, 'exists').mockResolvedValue(null);
    jest.spyOn(User, 'findOne').mockImplementation(filter => query([...entities.users.values()]
        .find(user => (Array.isArray(filter.username?.$in) ? filter.username.$in.includes(user.username) : filter.username === user.username)
            && (filter.isActive?.$ne !== false || user.isActive !== false)) || null));
    jest.spyOn(User, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    jest.spyOn(Notification, 'create').mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

test('the dashboard aggregates the authorized scope with bounded task and activity lists', async () => {
    const aggregate = jest.spyOn(Task, 'aggregate').mockResolvedValue([{
        statistics: [{ total: 3, done: 1, inProgress: 1, overdue: 1 }], upcoming: [], activity: []
    }]);
    const route = '/api/tasks/overview?today=2026-11-17&projectId=' + project.id;
    expect((await request('GET', route, { principal: outsider })).status).toBe(403);
    expect(aggregate).not.toHaveBeenCalled();
    const response = await request('GET', route, { principal: owner });
    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({ total: 3, done: 1, inProgress: 1, overdue: 1, rate: 33 });
    const [scope, , summary] = aggregate.mock.calls[0][0];
    expect(scope.$match).toMatchObject({ projectId: project._id, status: { $ne: 'archived' } });
    expect(summary.$facet.upcoming).toContainEqual({ $limit: 6 });
    expect(summary.$facet.activity).toContainEqual({ $limit: 8 });
});

test('task lists return a stable cursor and request summary fields only', async () => {
    const createdAt = new Date('2026-11-17T09:00:00.000Z');
    const older = { _id: id(), title: 'أقدم', createdAt: new Date('2026-11-16T09:00:00.000Z') };
    const first = { _id: task._id, title: task.title, createdAt };
    const rows = query([first, older]);
    const select = jest.spyOn(rows, 'select');
    const find = jest.spyOn(Task, 'find').mockReturnValueOnce(rows).mockReturnValueOnce(query([older]));
    const filter = '/api/tasks?view=list&limit=1&projectId=' + project.id;
    const response = await request('GET', filter, { principal: owner });
    const cursor = createdAt.toISOString() + '~' + first._id;
    expect(response.status).toBe(200);
    expect(response.headers).toContain('X-Next-Cursor: ' + cursor);
    expect(response.body.map(item => item.title)).toEqual([first.title]);
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining('activity'));

    const second = await request('GET', filter + '&after=' + encodeURIComponent(cursor), { principal: owner });
    expect(second.body.map(item => item.title)).toEqual([older.title]);
    expect(find.mock.calls[1][0]).toMatchObject({
        status: { $ne: 'archived' },
        $and: [{ $or: expect.arrayContaining([{ createdAt, _id: { $lt: String(first._id) } }]) }]
    });
});

test('an unread notification count is private to the signed-in account', async () => {
    const count = jest.spyOn(Notification, 'countDocuments').mockResolvedValue(4);
    const route = '/api/notifications/unread-count';
    expect((await request('GET', route)).status).toBe(401);
    expect((await request('GET', route, { principal: owner })).body).toEqual({ count: 4 });
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ userId: owner.id, isRead: false });
});

test('Kanban returns task summaries and enforces the same project permissions', async () => {
    const aggregate = jest.spyOn(Task, 'aggregate').mockResolvedValue([{
        _id: task._id, title: task.title, commentCount: 2, attachmentCount: 1
    }]);
    const path = '/api/tasks?view=board&projectId=' + project.id;
    expect((await request('GET', path, { principal: outsider })).status).toBe(403);
    expect(aggregate).not.toHaveBeenCalled();
    const response = await request('GET', path, { principal: owner });
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ commentCount: 2, attachmentCount: 1 });
    const [scope, , projection] = aggregate.mock.calls[0][0];
    expect(scope.$match).toMatchObject({ projectId: project._id, status: { $ne: 'archived' } });
    expect(projection.$project).not.toHaveProperty('comments');
    expect(projection.$project).not.toHaveProperty('attachments');
    expect(projection.$project).not.toHaveProperty('activity');
});

test('workspace settings enforce membership and keep the invitation code private to managers', async () => {
    jest.spyOn(Project, 'countDocuments').mockResolvedValue(1);
    const route = '/api/workspaces/' + workspace.id + '/settings';

    const denied = await request('GET', route, { principal: outsider });
    expect(denied.status).toBe(403);

    const regular = await request('GET', route, { principal: member });
    expect(regular.status).toBe(200);
    expect(regular.body.role).toBe('member');
    expect(regular.body).not.toHaveProperty('inviteCode');
    expect(regular.body.usage).toMatchObject({ currentMembers: 2, currentProjects: 1 });

    const privileged = await request('GET', route, { principal: owner });
    expect(privileged.status).toBe(200);
    expect(privileged.body).toMatchObject({ name: workspace.name, role: 'owner', inviteCode: workspace.inviteCode });
});

test('contact messages are validated and saved to the support inbox with an optional phone', async () => {
    const save = jest.spyOn(Ticket, 'create').mockResolvedValue(new Ticket());
    const body = { name: ' اسم المرسل ', email: ' sender@example.test ', message: ' تفاصيل الاستفسار ' };

    const invalid = await request('POST', '/api/contact', { body: { ...body, email: 'invalid address' } });
    expect(invalid.status).toBe(400);
    expect(save).not.toHaveBeenCalled();

    const accepted = await request('POST', '/api/contact', { body });
    expect(accepted.status).toBe(201);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
        subject: expect.any(String),
        message: 'تفاصيل الاستفسار',
        contact: { name: 'اسم المرسل', email: 'sender@example.test', phone: '' }
    });

    const inbox = await request('GET', '/api/admin/tickets');
    expect(inbox.status).toBe(401);
});
afterAll(() => {
    const resolvedRoot = fs.realpathSync(os.tmpdir());
    const resolvedTemp = fs.realpathSync(temp);
    const relative = path.relative(resolvedRoot, resolvedTemp);
    if (relative.startsWith('nivora-test-') && !relative.includes(path.sep)) fs.rmSync(resolvedTemp, { recursive: true, force: true });
});

test('protected routes reject missing or unsigned credentials', async () => {
    expect((await request('GET', '/api/tasks')).status).toBe(401);
    expect((await request('GET', '/api/tasks', { token: 'invalid' })).status).toBe(401);
});

test('password sign-in produces a working session, which revocation invalidates', async () => {
    const result = await request('POST', '/api/auth/login', { body: { username: owner.username, password: 'correct-password' } });
    expect(result.status).toBe(200);
    const token = result.body.token;
    expect((await request('GET', '/api/auth/profile', { token })).body.fullName).toBe(owner.fullName);
    owner.sessionVersion = 1;
    expect((await request('GET', '/api/auth/profile', { token })).status).toBe(401);
});

test('a deactivated account cannot sign in, and user credentials cannot enter the admin API', async () => {
    owner.isActive = false;
    expect((await request('POST', '/api/auth/login', { body: { username: owner.username, password: 'correct-password' } })).status).toBe(400);
    expect((await request('GET', '/api/admin/stats', { principal: manager })).status).toBe(401);
    manager.role = 'user';
    expect((await request('GET', '/api/admin/stats', { token: issueSession(manager, 'nivora-admin') })).status).toBe(401);
});

test('workspace member listing is authorized by the URL and exposes only shared profile fields', async () => {
    jest.spyOn(User, 'find').mockReturnValue(query([
        { _id: owner._id, username: owner.username }, { _id: member._id, username: member.username }
    ]));
    const current = await request('GET', '/api/workspaces/' + workspace.id + '/members', { principal: member });
    expect(current.status).toBe(200);
    expect(current.body.map(row => row.userId.username)).toEqual([owner.username, member.username]);
    expect(current.body[0].userId.password).toBeUndefined();
    expect((await request('GET', '/api/workspaces/' + workspace.id + '/members', { principal: outsider })).status).toBe(403);
});

test('team invite uses an atomic membership update and hides the invitation code from new members', async () => {
    workspace.members.pull(workspace.members[1]._id);
    jest.spyOn(Workspace, 'findOne').mockReturnValue(query(workspace));
    const join = jest.spyOn(Workspace, 'findOneAndUpdate').mockImplementation((_filter, update) => {
        workspace.members.push(update.$push.members);
        return query(workspace);
    });
    const result = await request('POST', '/api/workspaces/join', { principal: member, body: { code: workspace.inviteCode } });
    expect(result.status).toBe(200);
    expect(result.body.role).toBe('member');
    expect(result.body.inviteCode).toBeUndefined();
    expect(join.mock.calls[0][0]).toHaveProperty('$expr');
    expect(join.mock.calls[0][0]['members.userId']).toEqual({ $ne: member.id });
});

test('owner assigns an actual member, that member can update the task, outsiders cannot see or edit it', async () => {
    jest.spyOn(Task, 'create').mockImplementation(fields => {
        const created = document(Task, fields);
        entities.tasks.set(created.id, created);
        return Promise.resolve(created);
    });

    const base = { title: 'تسليم التصميم', projectId: project.id };
    expect((await request('POST', '/api/tasks', { principal: owner, body: { ...base, assigneeId: outsider.id } })).status).toBe(400);
    const created = await request('POST', '/api/tasks', { principal: owner, body: { ...base, assigneeId: member.id, workspaceId: workspace.id } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ assigneeId: member.id, assignee: member.fullName, workspaceId: workspace.id });

    const route = '/api/tasks/' + created.body._id;
    expect((await request('GET', route, { principal: member })).status).toBe(200);
    expect((await request('PATCH', route, { principal: member, body: { status: 'review', followers: [member.username] } })).body.task)
        .toMatchObject({ status: 'review', followers: [member.username] });
    expect((await request('GET', route, { principal: outsider })).status).toBe(403);
    expect((await request('PATCH', route, { principal: outsider, body: { status: 'done' } })).status).toBe(403);
    expect((await request('PATCH', route, { principal: owner, body: { workspaceId: otherWorkspace.id } })).status).toBe(400);
});

test('legacy tasks without their own workspace still inherit the project membership', async () => {
    task.workspaceId = null;
    expect((await request('GET', '/api/tasks/' + task.id, { principal: member })).status).toBe(200);
    workspace.members.pull(workspace.members.find(entry => String(entry.userId) === member.id)._id);
    expect((await request('GET', '/api/tasks/' + task.id, { principal: member })).status).toBe(403);
});

test('project metrics use one aggregate and task filters treat regex input as text', async () => {
    jest.spyOn(Project, 'find').mockReturnValue(query([project.toObject()]));
    const aggregate = jest.spyOn(Task, 'aggregate').mockResolvedValue([{ _id: project._id, taskCount: 2, doneCount: 1 }]);
    const projects = await request('GET', '/api/projects?workspaceId=' + workspace.id, { principal: member });
    expect(projects.body[0].completionRate).toBe(50);
    expect(aggregate).toHaveBeenCalledTimes(1);
    const find = jest.spyOn(Task, 'find').mockReturnValue(query([task]));
    await request('GET', '/api/tasks?projectId=' + project.id + '&search=.*', { principal: member });
    expect(find.mock.calls[0][0].$and[0].$or[0].title.$regex).toBe('\\.\\*');
});

test('private attachment upload, download, and delete enforce task membership', async () => {
    const base = '/api/tasks/' + task.id + '/attachments';
    const boundary = 'nivora-test-boundary';
    const payload = Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="مرفق.txt"\r\nContent-Type: text/plain\r\n\r\nprivate contents\r\n--' + boundary + '--\r\n');
    const options = { bytes: payload, contentType: 'multipart/form-data; boundary=' + boundary };
    expect((await request('POST', base + '/upload', { principal: outsider, ...options })).status).toBe(403);
    const upload = await request('POST', base + '/upload', { principal: member, ...options });
    expect(upload.status).toBe(201);
    const attachment = upload.body.attachments[0];
    expect(attachment.name).toBe('مرفق.txt');
    expect((await request('GET', attachment.url, { principal: outsider })).status).toBe(403);
    const download = await request('GET', attachment.url, { principal: owner });
    expect(download.status).toBe(200);
    expect(download.body.toString()).toBe('private contents');
    expect((await request('DELETE', base + '/' + attachment._id, { principal: outsider })).status).toBe(403);
    expect((await request('DELETE', base + '/' + attachment._id, { principal: owner })).status).toBe(200);
});

test('project file metadata is protected by the parent project', async () => {
    const file = new File({ name: 'بيانات', originalName: 'بيانات', url: 'https://example.test/file', projectId: project.id, workspaceId: workspace.id, userId: owner.id });
    record(File, new Map([[file.id, file]]));
    expect((await request('GET', '/api/files/' + file.id, { principal: outsider })).status).toBe(403);
    expect((await request('GET', '/api/files/' + file.id, { principal: member })).status).toBe(200);
    expect((await request('PATCH', '/api/files/' + file.id + '/move', { principal: outsider, body: { folderId: null } })).status).toBe(403);
});

test('chat writes are scoped by membership and server-side identity', async () => {
    const create = jest.spyOn(Message, 'create').mockImplementation(fields => Promise.resolve(new Message(fields)));
    const scope = { workspaceId: workspace.id, projectId: project.id };
    expect((await request('POST', '/api/chat', { principal: outsider, body: { ...scope, text: 'غير مصرح' } })).status).toBe(403);
    const sent = await request('POST', '/api/chat', { principal: member, body: { ...scope, text: 'مرحبا', username: owner.username } });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ workspaceId: workspace.id, projectId: project.id, username: member.username });
    expect(create).toHaveBeenCalledTimes(1);
    expect((await request('GET', '/api/chat?workspaceId=' + workspace.id, { principal: outsider })).status).toBe(403);
});

test('default health endpoint reports an unavailable database without claiming readiness', async () => {
    const response = await request('GET', '/api/health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ server: 'ok', database: 'unavailable' });
});

test('task dependencies reject cross-project and circular links and keep existing links editable', async () => {
    const related = document(Task, { title: 'مهمة مرتبطة', projectId: project.id, workspaceId: workspace.id, userId: owner.id });
    const another = document(Task, { title: 'متطلب ثان', projectId: project.id, workspaceId: workspace.id, userId: owner.id });
    jest.spyOn(Task, 'find').mockImplementation(() => query([task, related, another]));
    const endpoint = '/api/tasks/' + task.id + '/dependencies';
    expect((await request('POST', endpoint, { principal: owner, body: { taskId: String(id()) } })).status).toBe(400);
    related.dependencies.push({ taskId: task._id });
    expect((await request('POST', endpoint, { principal: owner, body: { taskId: related.id } })).status).toBe(400);
    related.dependencies = [];
    expect((await request('POST', endpoint, { principal: owner, body: { taskId: related.id } })).status).toBe(201);
    const added = await request('POST', endpoint, { principal: owner, body: { taskId: another.id } });
    expect(added.status).toBe(201);
    expect(added.body.dependencies).toHaveLength(2);
});

test('workflow steps keep their label and color when saved from the editor', async () => {
    const create = jest.spyOn(Workflow, 'create').mockImplementation(fields => Promise.resolve(new Workflow(fields)));
    const steps = [{ name: 'مراجعة', color: '#112233', icon: '✓' }];
    const response = await request('POST', '/api/workflows', { principal: owner, body: { name: 'سير العمل', steps } });
    expect(response.status).toBe(201);
    expect(response.body.steps).toEqual(steps);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: owner.id }));
});

test('applying a template creates only the selected tasks within the authorized project', async () => {
    const template = new Template({ name: 'قالب', tasks: [{ title: 'الأولى' }, { title: 'الثانية' }], userId: owner.id });
    jest.spyOn(Template, 'findOne').mockReturnValue(query(template));
    const insert = jest.spyOn(Task, 'insertMany').mockImplementation(rows => Promise.resolve(rows));
    const response = await request('POST', '/api/templates/' + template.id + '/apply', {
        principal: owner, body: { projectId: project.id, taskIndexes: [1] }
    });
    expect(response.status).toBe(201);
    expect(insert.mock.calls[0][0]).toEqual([expect.objectContaining({
        title: 'الثانية', projectId: project._id, workspaceId: workspace._id
    })]);
});
