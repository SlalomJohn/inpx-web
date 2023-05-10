const sax = require('./sax');

//node types
const NODE = 1;
const TEXT = 2;
const CDATA = 3;
const COMMENT = 4;

const name2type = {
    'NODE': NODE,
    'TEXT': TEXT,
    'CDATA': CDATA,
    'COMMENT': COMMENT,
};

const type2name = {
    [NODE]: 'NODE',
    [TEXT]: 'TEXT',
    [CDATA]: 'CDATA',
    [COMMENT]: 'COMMENT',
};

class NodeBase {
    wideSelector(selectorString) {
        const result = {all: false, before: false, type: 0, name: ''};

        if (selectorString === '') {
            result.before = true;
        } else if (selectorString === '*') {
            result.all = true;        
        } else if (selectorString[0] === '*') {
            const typeName = selectorString.substring(1);
            result.type = name2type[typeName];
            if (!result.type)
                throw new Error(`Unknown selector type: ${typeName}`);
        } else {
            result.name = selectorString;
        }

        return result;
    }

    checkNode(rawNode, selectorObj) {
        return selectorObj.all || selectorObj.before
            || (selectorObj.type && rawNode[0] === selectorObj.type)
            || (rawNode[0] === NODE && rawNode[1] === selectorObj.name);
    }

    findNodeIndex(nodes, selectorObj) {
        for (let i = 0; i < nodes.length; i++)
            if (this.checkNode(nodes[i], selectorObj))
                return i;
    }

    rawAdd(nodes, rawNode, selectorObj) {
        if (selectorObj.all) {
            nodes.push(rawNode);
        } else if (selectorObj.before) {
            nodes.unshift(rawNode);
        } else {
            const index = this.findNodeIndex(nodes, selectorObj);
            if (index >= 0)
                nodes.splice(index, 0, rawNode);
            else 
                nodes.push(rawNode);
        }
    }

    rawRemove(nodes, selectorObj) {
        if (selectorObj.before)
            return;

        for (let i = nodes.length - 1; i >= 0; i--) {
            if (this.checkNode(nodes[i], selectorObj))
                nodes.splice(i, 1);
        }
    }
}

class NodeObject extends NodeBase {
    constructor(raw = null) {
        super();

        if (raw)
            this.raw = raw;
        else
            this.raw = [];
    }

    get type() {
        return this.raw[0] || null;
    }

    get name() {
        if (this.type === NODE)
            return this.raw[1] || null;

        return null;
    }

    set name(value) {
        if (this.type === NODE)
            this.raw[1] = value;
    }

    attrs(key, value) {
        if (this.type !== NODE)
            return null;

        let map = null;

        if (key instanceof Map) {
            map = key;
            this.raw[2] = Array.from(map);
        } else if (Array.isArray(this.raw[2])) {
            map = new Map(this.raw[2]);
            if (key) {
                map.set(key, value);
                this.raw[2] = Array.from(map);
            }
        }

        return map;
    }

    get value() {
        switch (this.type) {
            case NODE:
                return this.raw[3] || null;
            case TEXT:
            case CDATA:
            case COMMENT:
                return this.raw[1] || null;
        }

        return null;
    }

    set value(v) {
        switch (this.type) {
            case NODE:
                this.raw[3] = v;
                break;
            case TEXT:
            case CDATA:
            case COMMENT:
                this.raw[1] = v;
        }
    }

    add(node, after = '*') {
        if (this.type !== NODE)
            return;

        const selectorObj = this.wideSelector(after);

        if (!Array.isArray(this.raw[3]))
            this.raw[3] = [];

        if (Array.isArray(node)) {
            for (const node_ of node)
                this.rawAdd(this.raw[3], node_.raw, selectorObj);
        } else {
            this.rawAdd(this.raw[3], node.raw, selectorObj);
        }

        return this;
    }

    remove(selector = '') {
        if (this.type !== NODE || !this.raw[3])
            return;

        const selectorObj = this.wideSelector(selector);

        this.rawRemove(this.raw[3], selectorObj);
        if (!this.raw[3].length)
            this.raw[3] = null;

        return this;
    }

    each(callback) {
        if (this.type !== NODE || !this.raw[3])
            return;

        for (const n of this.raw[3]) {
            if (callback(new NodeObject(n)) === false)
                break;
        }

        return this;
    }

    eachDeep(callback) {
        if (this.type !== NODE || !this.raw[3])
            return;

        const deep = (nodes, route = '') => {
            for (const n of nodes) {
                const node = new NodeObject(n);

                if (callback(node, route) === false)
                    return false;

                if (node.type === NODE && node.value) {
                    if (deep(node.value, `${route}${route ? '/' : ''}${node.name}`) === false)
                        return false;
                }
            }
        }

        deep(this.raw[3]);

        return this;
    }
}

class XmlParser extends NodeBase {
    constructor(rawNodes = []) {
        super();

        this.NODE = NODE;
        this.TEXT = TEXT;
        this.CDATA = CDATA;
        this.COMMENT = COMMENT;

        this.rawNodes = rawNodes;
    }

    get count() {
        return this.rawNodes.length;
    }

    get nodes() {
        const result = [];
        for (const n of this.rawNodes)
            result.push(new NodeObject(n));

        return result;
    }

    nodeObject(node) {
        return new NodeObject(node);
    }

    newParser(nodes) {
        return new XmlParser(nodes);
    }

    checkType(type) {
        if (!type2name[type])
            throw new Error(`Invalid type: ${type}`);
    }

    createTypedNode(type, nameOrValue, attrs = null, value = null) {
        this.checkType(type);
        switch (type) {
            case NODE:
                if (!nameOrValue || typeof(nameOrValue) !== 'string')
                    throw new Error('Node name must be non-empty string');
                return new NodeObject([type, nameOrValue, attrs, value]);
            case TEXT:
            case CDATA:
            case COMMENT:
                if (typeof(nameOrValue) !== 'string')
                    throw new Error('Node value must be of type string');
                return new NodeObject([type, nameOrValue]);
        }
    }

    createNode(name, attrs = null, value = null) {
        return this.createTypedNode(NODE, name, attrs, value);
    }

    createText(value = null) {
        return this.createTypedNode(TEXT, value);
    }

    createCdata(value = null) {
        return this.createTypedNode(CDATA, value);
    }

    createComment(value = null) {
        return this.createTypedNode(COMMENT, value);
    }

    add(node, after = '*') {
        const selectorObj = this.wideSelector(after);

        for (const n of this.rawNodes) {
            if (n && n[0] === NODE) {
                if (!Array.isArray(n[3]))
                    n[3] = [];
                
                if (Array.isArray(node)) {
                    for (const node_ of node)
                        this.rawAdd(n[3], node_.raw, selectorObj);
                } else {
                    this.rawAdd(n[3], node.raw, selectorObj);
                }
            }
        }

        return this;
    }

    addRoot(node, after = '*') {
        const selectorObj = this.wideSelector(after);

        if (Array.isArray(node)) {
            for (const node_ of node)
                this.rawAdd(this.rawNodes, node_.raw, selectorObj);
        } else {
            this.rawAdd(this.rawNodes, node.raw, selectorObj);
        }

        return this;
    }

    remove(selector = '') {
        const selectorObj = this.wideSelector(selector);

        for (const n of this.rawNodes) {
            if (n && n[0] === NODE && Array.isArray(n[3])) {
                this.rawRemove(n[3], selectorObj);
                if (!n[3].length)
                    n[3] = null;
            }
        }

        return this;
    }

    removeRoot(selector = '') {
        const selectorObj = this.wideSelector(selector);

        this.rawRemove(this.rawNodes, selectorObj);

        return this;
    }

    each(callback, self = false) {
        if (self) {
            for (const n of this.rawNodes) {
                if (callback(new NodeObject(n)) === false)
                    return this;
            }
        } else {
            for (const n of this.rawNodes) {
                if (n[0] === NODE && n[3]) {
                    for (const nn of n[3])
                        if (callback(new NodeObject(nn)) === false)
                            return this;
                }
            }
        }

        return this;
    }

    eachSelf(callback) {
        return this.each(callback, true);
    }

    eachDeep(callback, self = false) {
        const deep = (nodes, route = '') => {
            for (const n of nodes) {
                const node = new NodeObject(n);

                if (callback(node, route) === false)
                    return false;

                if (node.type === NODE && node.value) {
                    if (deep(node.value, `${route}${route ? '/' : ''}${node.name}`) === false)
                        return false;
                }
            }
        }

        if (self) {
            deep(this.rawNodes);
        } else {
            for (const n of this.rawNodes) {
                if (n[0] === NODE && n[3])
                    if (deep(n[3]) === false)
                        break;
            }
        }

        return this;
    }

    eachDeepSelf(callback) {
        return this.eachDeep(callback, true);
    }

    rawSelect(nodes, selectorObj, callback) {
        for (const n of nodes)
            if (this.checkNode(n, selectorObj))
                callback(n);

        return this;
    }

    select(selector = '', self = false) {
        let newRawNodes = [];

        if (selector.indexOf('/') >= 0) {
            const selectors = selector.split('/');
            let res = this;
            for (const sel of selectors) {
                res = res.select(sel, self);
                self = false;
            }

            newRawNodes = res.rawNodes;
        } else {
            const selectorObj = this.wideSelector(selector);

            if (self) {
                this.rawSelect(this.rawNodes, selectorObj, (node) => {
                    newRawNodes.push(node);
                })
            } else {
                for (const n of this.rawNodes) {
                    if (n && n[0] === NODE && Array.isArray(n[3])) {
                        this.rawSelect(n[3], selectorObj, (node) => {
                            newRawNodes.push(node);
                        })
                    }
                }
            }
        }

        return new XmlParser(newRawNodes);
    }

    selectSelf(selector) {
        return this.select(selector, true);
    }

    selectFirst(selector, self) {
        const result = this.select(selector, self);
        const node = (result.count ? result.rawNodes[0] : null);
        return new NodeObject(node);
    }

    selectFirstSelf(selector) {
        return this.selectFirst(selector, true);
    }

    toJson(options = {}) {
        const {format = false} = options;

        if (format)
            return JSON.stringify(this.rawNodes, null, 2);
        else
            return JSON.stringify(this.rawNodes);
    }

    fromJson(jsonString) {
        const parsed = JSON.parse(jsonString);
        if (!Array.isArray(parsed))
            throw new Error('JSON parse error: root element must be array');

        this.rawNodes = parsed;

        return this;
    }

    toString(options = {}) {
        const {
            encoding = 'utf-8',
            format = false,
            noHeader = false,
            expandEmpty = false
        } = options;

        let deepType = 0;
        let out = '';
        if (!noHeader)
            out += `<?xml version="1.0" encoding="${encoding}"?>`;

        const nodesToString = (nodes, depth = 0) => {
            let result = '';

            const indent = '\n' + ' '.repeat(depth);
            let lastType = 0;

            for (const n of nodes) {
                const node = new NodeObject(n);

                let open = '';
                let body = '';
                let close = '';

                if (node.type === NODE) {
                    if (!node.name)
                        continue;

                    let attrs = '';

                    const nodeAttrs = node.attrs();
                    if (nodeAttrs) {
                        for (const [attrName, attrValue] of nodeAttrs) {
                            if (typeof(attrValue) === 'string')
                                attrs += ` ${attrName}="${attrValue}"`;
                            else
                                if (attrValue)
                                    attrs += ` ${attrName}`;
                        }
                    }

                    if (node.value)
                        body = nodesToString(node.value, depth + 2);

                    if (!body && !expandEmpty) {
                        open = (format && lastType !== TEXT ? indent : '');
                        open += `<${node.name}${attrs}/>`;
                    } else {
                        open = (format && lastType !== TEXT ? indent : '');
                        open += `<${node.name}${attrs}>`;

                        close = (format && deepType && deepType !== TEXT ? indent : '');
                        close += `</${node.name}>`;
                    }
                } else if (node.type === TEXT) {
                    body = node.value || '';
                } else if (node.type === CDATA) {
                    body = (format && lastType !== TEXT ? indent : '');
                    body += `<![CDATA[${node.value || ''}]]>`;
                } else if (node.type === COMMENT) {
                    body = (format && lastType !== TEXT ? indent : '');
                    body += `<!--${node.value || ''}-->`;
                }

                result += `${open}${body}${close}`;
                lastType = node.type;
            }

            deepType = lastType;
            return result;
        }

        out += nodesToString(this.rawNodes) + (format ? '\n' : '');

        return out;
    }

    fromString(xmlString, options = {}) {
        const {
            lowerCase = false,
            whiteSpace = false,
            pickNode = false,
        } = options;

        const parsed = [];
        const root = this.createNode('root', null, parsed);//fake node
        let node = root;

        let route = '';
        let routeStack = [];
        let ignoreNode = false;

        const onStartNode = (tag, tail, singleTag, cutCounter, cutTag) => {// eslint-disable-line no-unused-vars
            if (tag == '?xml')
                return;

            if (!ignoreNode && pickNode) {
                route += `${route ? '/' : ''}${tag}`;
                ignoreNode = !pickNode(route);
            }

            let newNode = node;
            if (!ignoreNode)
                newNode = this.createNode(tag);

            routeStack.push({tag, route, ignoreNode, node: newNode});

            if (ignoreNode)
                return;

            if (tail && tail.trim() !== '') {
                const parsedAttrs = sax.getAttrsSync(tail, lowerCase);
                const attrs = new Map();
                for (const attr of parsedAttrs.values()) {
                    attrs.set(attr.fn, attr.value);
                }

                if (attrs.size)
                    newNode.attrs(attrs);
            }

            if (!node.value)
                node.value = [];
            node.value.push(newNode.raw);
            node = newNode;
        };

        const onEndNode = (tag, tail, singleTag, cutCounter, cutTag) => {// eslint-disable-line no-unused-vars
            if (routeStack.length && routeStack[routeStack.length - 1].tag === tag) {
                routeStack.pop();

                if (routeStack.length) {
                    const last = routeStack[routeStack.length - 1];
                    route = last.route;
                    ignoreNode = last.ignoreNode;
                    node = last.node;
                } else {
                    route = '';
                    ignoreNode = false;
                    node = root;
                }
            }
        }

        const onTextNode = (text, cutCounter, cutTag) => {// eslint-disable-line no-unused-vars
            if (ignoreNode || (pickNode && !pickNode(`${route}/*TEXT`)))
                return;

            if (!whiteSpace && text.trim() == '')
                return;

            if (!node.value)
                node.value = [];

            node.value.push(this.createText(text).raw);
        };

        const onCdata = (tagData, cutCounter, cutTag) => {// eslint-disable-line no-unused-vars
            if (ignoreNode || (pickNode && !pickNode(`${route}/*CDATA`)))
                return;

            if (!node.value)
                node.value = [];

            node.value.push(this.createCdata(tagData).raw);
        }

        const onComment = (tagData, cutCounter, cutTag) => {// eslint-disable-line no-unused-vars
            if (ignoreNode || (pickNode && !pickNode(`${route}/*COMMENT`)))
                return;

            if (!node.value)
                node.value = [];

            node.value.push(this.createComment(tagData).raw);
        }

        sax.parseSync(xmlString, {
            onStartNode, onEndNode, onTextNode, onCdata, onComment, lowerCase
        });

        this.rawNodes = parsed;

        return this;
    }

    toObject(options = {}) {
        const {
            compactText = false
        } = options;

        const nodesToObject = (nodes) => {
            const result = {};

            for (const n of nodes) {
                const node = new NodeObject(n);

                if (node.type === NODE) {
                    if (!node.name)
                        continue;

                    let newNode = {};

                    const nodeAttrs = node.attrs();
                    if (nodeAttrs)
                        newNode['*ATTRS'] = Object.fromEntries(nodeAttrs);

                    if (node.value) {
                        Object.assign(newNode, nodesToObject(node.value));

                        //схлопывание текстового узла до string
                        if (compactText
                            && !Array.isArray(newNode)
                            && Object.prototype.hasOwnProperty.call(newNode, '*TEXT')
                            && Object.keys(newNode).length === 1) {
                            newNode = newNode['*TEXT'];
                        }
                    }

                    if (!Object.prototype.hasOwnProperty.call(result, node.name)) {
                        result[node.name] = newNode;
                    } else {
                        if (!Array.isArray(result[node.name])) {
                            result[node.name] = [result[node.name]];
                        }

                        result[node.name].push(newNode);
                    }
                } else if (node.type === TEXT) {
                    if (!result['*TEXT'])
                        result['*TEXT'] = '';
                    result['*TEXT'] += node.value || '';
                } else if (node.type === CDATA) {
                    if (!result['*CDATA'])
                        result['*CDATA'] = '';
                    result['*CDATA'] += node.value || '';
                } else if (node.type === COMMENT) {
                    if (!result['*COMMENT'])
                        result['*COMMENT'] = '';
                    result['*COMMENT'] += node.value || '';
                }
            }

            return result;
        }

        return nodesToObject(this.rawNodes);
    }

    fromObject(xmlObject) {
        const objectToNodes = (obj) => {
            const result = [];

            for (const [tag, objNode] of Object.entries(obj)) {
                if (tag === '*TEXT') {
                    result.push(this.createText(objNode).raw);
                } else if (tag === '*CDATA') {
                    result.push(this.createCdata(objNode).raw);
                } else if (tag === '*COMMENT') {
                    result.push(this.createComment(objNode).raw);
                } else if (tag === '*ATTRS') {
                    //пропускаем
                } else {
                    if (typeof(objNode) === 'string' || typeof(objNode) === 'number') {
                        result.push(this.createNode(tag, null, [this.createText(objNode.toString()).raw]).raw);
                    } else if (Array.isArray(objNode)) {
                        for (const n of objNode) {
                            if (typeof(n) === 'string') {
                                result.push(this.createNode(tag, null, [this.createText(n).raw]).raw);
                            } else if (typeof(n) === 'object') {
                                result.push(this.createNode(tag, (n['*ATTRS'] ? Object.entries(n['*ATTRS']) : null), objectToNodes(n)).raw);
                            }
                        }

                    } else if (typeof(objNode) === 'object') {
                        result.push(this.createNode(tag, (objNode['*ATTRS'] ? Object.entries(objNode['*ATTRS']) : null), objectToNodes(objNode)).raw);
                    } else {
                        throw new Error(`Unknown node type "${typeof(objNode)}" of node: ${objNode}`);
                    }
                }
            }

            return result;
        };

        this.rawNodes = objectToNodes(xmlObject);

        return this;
    }

    // XML Inspector start
    narrowSelector(selector) {
        const result = [];
        selector = selector.trim();
        
        //последний индекс не учитывется, только если не задан явно
        if (selector && selector[selector.length - 1] == ']')
            selector += '/';

        const levels = selector.split('/');

        for (const level of levels) {
            const [name, indexPart] = level.split('[');
            let index = 0;
            if (indexPart) {
                const i = indexPart.indexOf(']');
                index = parseInt(indexPart.substring(0, i), 10) || 0;
            }

            let type = NODE;
            if (name[0] === '*') {
                const typeName = name.substring(1);
                type = name2type[typeName];
                if (!type)
                    throw new Error(`Unknown selector type: ${typeName}`);
            }

            result.push({type, name, index});
        }

        if (result.length);
            result[result.length - 1].last = true;

        return result;
    }

    inspect(selector = '') {
        selector = this.narrowSelector(selector);

        let raw = this.rawNodes;
        for (const s of selector) {
            if (s.name) {
                let found = [];
                for (const n of raw) {
                    if (n[0] === s.type && (n[0] !== NODE || s.name === '*NODE' || n[1] === s.name)) {
                        found.push(n);

                        if (found.length > s.index && !s.last)
                            break;
                    }
                }

                raw = found;
            }

            if (raw.length && !s.last) {
                if (s.index < raw.length) {
                    raw = raw[s.index];
                    if (raw[0] === NODE && raw[3])
                        raw = raw[3];
                    else {
                        raw = [];
                        break;
                    }
                } else {
                    raw = [];
                    break;
                }
            }
        }

        return new XmlParser(raw);
    }

    $$(selector) {
        return this.inspect(selector);
    }

    $$array(selector) {
        const res = this.inspect(selector);
        const result = [];
        for (const n of res.rawNodes)
            if (n[0] === NODE)
                result.push(new XmlParser([n]));

        return result;
    }

    $(selector) {
        const res = this.inspect(selector);
        const node = (res.count ? res.rawNodes[0] : null);
        return new NodeObject(node);
    }

    v(selector = '') {
        const res = this.$(selector);
        return (res.type ? res.value : null);
    }

    text(selector = '') {
        const res = this.$(`${selector}/*TEXT`);
        return (res.type === TEXT ? res.value : null);
    }

    comment(selector = '') {
        const res = this.$(`${selector}/*COMMENT`);
        return (res.type === COMMENT ? res.value : null);
    }

    cdata(selector = '') {
        const res = this.$(`${selector}/*CDATA`);
        return (res.type === CDATA ? res.value : null);
    }

    concat(selector = '') {
        const res = this.$$(selector);
        const out = [];
        for (const n of res.rawNodes) {
            const node = new NodeObject(n);
            if (node.type && node.type !== NODE)
                out.push(node.value);
        }

        return (out.length ? out.join('') : null);
    }

    attrs(selector = '') {
        const res = this.$(selector);
        const attrs = res.attrs();
        return (res.type === NODE && attrs ? Object.fromEntries(attrs) : null);
    }
    // XML Inspector finish
}

module.exports = XmlParser;