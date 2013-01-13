(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    
    require.define = function (filename, fn) {
        if (require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};
});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process){var process = module.exports = {};

process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();
});

require.define("vm",function(require,module,exports,__dirname,__filename,process){module.exports = require("vm-browserify")});

require.define("/node_modules/vm-browserify/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"index.js"}});

require.define("/node_modules/vm-browserify/index.js",function(require,module,exports,__dirname,__filename,process){var Object_keys = function (obj) {
    if (Object.keys) return Object.keys(obj)
    else {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    }
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

var Script = exports.Script = function NodeScript (code) {
    if (!(this instanceof Script)) return new Script(code);
    this.code = code;
};

Script.prototype.runInNewContext = function (context) {
    if (!context) context = {};
    
    var iframe = document.createElement('iframe');
    if (!iframe.style) iframe.style = {};
    iframe.style.display = 'none';
    
    document.body.appendChild(iframe);
    
    var win = iframe.contentWindow;
    
    forEach(Object_keys(context), function (key) {
        win[key] = context[key];
    });
     
    if (!win.eval && win.execScript) {
        // win.eval() magically appears when this is called in IE:
        win.execScript('null');
    }
    
    var res = win.eval(this.code);
    
    forEach(Object_keys(win), function (key) {
        context[key] = win[key];
    });
    
    document.body.removeChild(iframe);
    
    return res;
};

Script.prototype.runInThisContext = function () {
    return eval(this.code); // maybe...
};

Script.prototype.runInContext = function (context) {
    // seems to be just runInNewContext on magical context objects which are
    // otherwise indistinguishable from objects except plain old objects
    // for the parameter segfaults node
    return this.runInNewContext(context);
};

forEach(Object_keys(Script.prototype), function (name) {
    exports[name] = Script[name] = function (code) {
        var s = Script(code);
        return s[name].apply(s, [].slice.call(arguments, 1));
    };
});

exports.createScript = function (code) {
    return exports.Script(code);
};

exports.createContext = Script.createContext = function (context) {
    // not really sure what this one does
    // seems to just make a shallow copy
    var copy = {};
    if(typeof context === 'object') {
        forEach(Object_keys(context), function (key) {
            copy[key] = context[key];
        });
    }
    return copy;
};
});

require.define("/node_modules/hashish/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"./index.js"}});

require.define("/node_modules/hashish/index.js",function(require,module,exports,__dirname,__filename,process){module.exports = Hash;
var Traverse = require('traverse');

function Hash (hash, xs) {
    if (Array.isArray(hash) && Array.isArray(xs)) {
        var to = Math.min(hash.length, xs.length);
        var acc = {};
        for (var i = 0; i < to; i++) {
            acc[hash[i]] = xs[i];
        }
        return Hash(acc);
    }
    
    if (hash === undefined) return Hash({});
    
    var self = {
        map : function (f) {
            var acc = { __proto__ : hash.__proto__ };
            Object.keys(hash).forEach(function (key) {
                acc[key] = f.call(self, hash[key], key);
            });
            return Hash(acc);
        },
        forEach : function (f) {
            Object.keys(hash).forEach(function (key) {
                f.call(self, hash[key], key);
            });
            return self;
        },
        filter : function (f) {
            var acc = { __proto__ : hash.__proto__ };
            Object.keys(hash).forEach(function (key) {
                if (f.call(self, hash[key], key)) {
                    acc[key] = hash[key];
                }
            });
            return Hash(acc);
        },
        detect : function (f) {
            for (var key in hash) {
                if (f.call(self, hash[key], key)) {
                    return hash[key];
                }
            }
            return undefined;
        },
        reduce : function (f, acc) {
            var keys = Object.keys(hash);
            if (acc === undefined) acc = keys.shift();
            keys.forEach(function (key) {
                acc = f.call(self, acc, hash[key], key);
            });
            return acc;
        },
        some : function (f) {
            for (var key in hash) {
                if (f.call(self, hash[key], key)) return true;
            }
            return false;
        },
        update : function (obj) {
            if (arguments.length > 1) {
                self.updateAll([].slice.call(arguments));
            }
            else {
                Object.keys(obj).forEach(function (key) {
                    hash[key] = obj[key];
                });
            }
            return self;
        },
        updateAll : function (xs) {
            xs.filter(Boolean).forEach(function (x) {
                self.update(x);
            });
            return self;
        },
        merge : function (obj) {
            if (arguments.length > 1) {
                return self.copy.updateAll([].slice.call(arguments));
            }
            else {
                return self.copy.update(obj);
            }
        },
        mergeAll : function (xs) {
            return self.copy.updateAll(xs);
        },
        has : function (key) { // only operates on enumerables
            return Array.isArray(key)
                ? key.every(function (k) { return self.has(k) })
                : self.keys.indexOf(key.toString()) >= 0;
        },
        valuesAt : function (keys) {
            return Array.isArray(keys)
                ? keys.map(function (key) { return hash[key] })
                : hash[keys]
            ;
        },
        tap : function (f) {
            f.call(self, hash);
            return self;
        },
        extract : function (keys) {
            var acc = {};
            keys.forEach(function (key) {
                acc[key] = hash[key];
            });
            return Hash(acc);
        },
        exclude : function (keys) {
            return self.filter(function (_, key) {
                return keys.indexOf(key) < 0
            });
        },
        end : hash,
        items : hash
    };
    
    var props = {
        keys : function () { return Object.keys(hash) },
        values : function () {
            return Object.keys(hash).map(function (key) { return hash[key] });
        },
        compact : function () {
            return self.filter(function (x) { return x !== undefined });
        },
        clone : function () { return Hash(Hash.clone(hash)) },
        copy : function () { return Hash(Hash.copy(hash)) },
        length : function () { return Object.keys(hash).length },
        size : function () { return self.length }
    };
    
    if (Object.defineProperty) {
        // es5-shim has an Object.defineProperty but it throws for getters
        try {
            for (var key in props) {
                Object.defineProperty(self, key, { get : props[key] });
            }
        }
        catch (err) {
            for (var key in props) {
                if (key !== 'clone' && key !== 'copy' && key !== 'compact') {
                    // ^ those keys use Hash() so can't call them without
                    // a stack overflow
                    self[key] = props[key]();
                }
            }
        }
    }
    else if (self.__defineGetter__) {
        for (var key in props) {
            self.__defineGetter__(key, props[key]);
        }
    }
    else {
        // non-lazy version for browsers that suck >_<
        for (var key in props) {
            self[key] = props[key]();
        }
    }
    
    return self;
};

// deep copy
Hash.clone = function (ref) {
    return Traverse.clone(ref);
};

// shallow copy
Hash.copy = function (ref) {
    var hash = { __proto__ : ref.__proto__ };
    Object.keys(ref).forEach(function (key) {
        hash[key] = ref[key];
    });
    return hash;
};

Hash.map = function (ref, f) {
    return Hash(ref).map(f).items;
};

Hash.forEach = function (ref, f) {
    Hash(ref).forEach(f);
};

Hash.filter = function (ref, f) {
    return Hash(ref).filter(f).items;
};

Hash.detect = function (ref, f) {
    return Hash(ref).detect(f);
};

Hash.reduce = function (ref, f, acc) {
    return Hash(ref).reduce(f, acc);
};

Hash.some = function (ref, f) {
    return Hash(ref).some(f);
};

Hash.update = function (a /*, b, c, ... */) {
    var args = Array.prototype.slice.call(arguments, 1);
    var hash = Hash(a);
    return hash.update.apply(hash, args).items;
};

Hash.merge = function (a /*, b, c, ... */) {
    var args = Array.prototype.slice.call(arguments, 1);
    var hash = Hash(a);
    return hash.merge.apply(hash, args).items;
};

Hash.has = function (ref, key) {
    return Hash(ref).has(key);
};

Hash.valuesAt = function (ref, keys) {
    return Hash(ref).valuesAt(keys);
};

Hash.tap = function (ref, f) {
    return Hash(ref).tap(f).items;
};

Hash.extract = function (ref, keys) {
    return Hash(ref).extract(keys).items;
};

Hash.exclude = function (ref, keys) {
    return Hash(ref).exclude(keys).items;
};

Hash.concat = function (xs) {
    var hash = Hash({});
    xs.forEach(function (x) { hash.update(x) });
    return hash.items;
};

Hash.zip = function (xs, ys) {
    return Hash(xs, ys).items;
};

// .length is already defined for function prototypes
Hash.size = function (ref) {
    return Hash(ref).size;
};

Hash.compact = function (ref) {
    return Hash(ref).compact.items;
};
});

require.define("/node_modules/hashish/node_modules/traverse/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"index.js"}});

require.define("/node_modules/hashish/node_modules/traverse/index.js",function(require,module,exports,__dirname,__filename,process){var traverse = module.exports = function (obj) {
    return new Traverse(obj);
};

function Traverse (obj) {
    this.value = obj;
}

Traverse.prototype.get = function (ps) {
    var node = this.value;
    for (var i = 0; i < ps.length; i ++) {
        var key = ps[i];
        if (!Object.hasOwnProperty.call(node, key)) {
            node = undefined;
            break;
        }
        node = node[key];
    }
    return node;
};

Traverse.prototype.has = function (ps) {
    var node = this.value;
    for (var i = 0; i < ps.length; i ++) {
        var key = ps[i];
        if (!Object.hasOwnProperty.call(node, key)) {
            return false;
        }
        node = node[key];
    }
    return true;
};

Traverse.prototype.set = function (ps, value) {
    var node = this.value;
    for (var i = 0; i < ps.length - 1; i ++) {
        var key = ps[i];
        if (!Object.hasOwnProperty.call(node, key)) node[key] = {};
        node = node[key];
    }
    node[ps[i]] = value;
    return value;
};

Traverse.prototype.map = function (cb) {
    return walk(this.value, cb, true);
};

Traverse.prototype.forEach = function (cb) {
    this.value = walk(this.value, cb, false);
    return this.value;
};

Traverse.prototype.reduce = function (cb, init) {
    var skip = arguments.length === 1;
    var acc = skip ? this.value : init;
    this.forEach(function (x) {
        if (!this.isRoot || !skip) {
            acc = cb.call(this, acc, x);
        }
    });
    return acc;
};

Traverse.prototype.paths = function () {
    var acc = [];
    this.forEach(function (x) {
        acc.push(this.path); 
    });
    return acc;
};

Traverse.prototype.nodes = function () {
    var acc = [];
    this.forEach(function (x) {
        acc.push(this.node);
    });
    return acc;
};

Traverse.prototype.clone = function () {
    var parents = [], nodes = [];
    
    return (function clone (src) {
        for (var i = 0; i < parents.length; i++) {
            if (parents[i] === src) {
                return nodes[i];
            }
        }
        
        if (typeof src === 'object' && src !== null) {
            var dst = copy(src);
            
            parents.push(src);
            nodes.push(dst);
            
            forEach(objectKeys(src), function (key) {
                dst[key] = clone(src[key]);
            });
            
            parents.pop();
            nodes.pop();
            return dst;
        }
        else {
            return src;
        }
    })(this.value);
};

function walk (root, cb, immutable) {
    var path = [];
    var parents = [];
    var alive = true;
    
    return (function walker (node_) {
        var node = immutable ? copy(node_) : node_;
        var modifiers = {};
        
        var keepGoing = true;
        
        var state = {
            node : node,
            node_ : node_,
            path : [].concat(path),
            parent : parents[parents.length - 1],
            parents : parents,
            key : path.slice(-1)[0],
            isRoot : path.length === 0,
            level : path.length,
            circular : null,
            update : function (x, stopHere) {
                if (!state.isRoot) {
                    state.parent.node[state.key] = x;
                }
                state.node = x;
                if (stopHere) keepGoing = false;
            },
            'delete' : function (stopHere) {
                delete state.parent.node[state.key];
                if (stopHere) keepGoing = false;
            },
            remove : function (stopHere) {
                if (isArray(state.parent.node)) {
                    state.parent.node.splice(state.key, 1);
                }
                else {
                    delete state.parent.node[state.key];
                }
                if (stopHere) keepGoing = false;
            },
            keys : null,
            before : function (f) { modifiers.before = f },
            after : function (f) { modifiers.after = f },
            pre : function (f) { modifiers.pre = f },
            post : function (f) { modifiers.post = f },
            stop : function () { alive = false },
            block : function () { keepGoing = false }
        };
        
        if (!alive) return state;
        
        function updateState() {
            if (typeof state.node === 'object' && state.node !== null) {
                if (!state.keys || state.node_ !== state.node) {
                    state.keys = objectKeys(state.node)
                }
                
                state.isLeaf = state.keys.length == 0;
                
                for (var i = 0; i < parents.length; i++) {
                    if (parents[i].node_ === node_) {
                        state.circular = parents[i];
                        break;
                    }
                }
            }
            else {
                state.isLeaf = true;
                state.keys = null;
            }
            
            state.notLeaf = !state.isLeaf;
            state.notRoot = !state.isRoot;
        }
        
        updateState();
        
        // use return values to update if defined
        var ret = cb.call(state, state.node);
        if (ret !== undefined && state.update) state.update(ret);
        
        if (modifiers.before) modifiers.before.call(state, state.node);
        
        if (!keepGoing) return state;
        
        if (typeof state.node == 'object'
        && state.node !== null && !state.circular) {
            parents.push(state);
            
            updateState();
            
            forEach(state.keys, function (key, i) {
                path.push(key);
                
                if (modifiers.pre) modifiers.pre.call(state, state.node[key], key);
                
                var child = walker(state.node[key]);
                if (immutable && Object.hasOwnProperty.call(state.node, key)) {
                    state.node[key] = child.node;
                }
                
                child.isLast = i == state.keys.length - 1;
                child.isFirst = i == 0;
                
                if (modifiers.post) modifiers.post.call(state, child);
                
                path.pop();
            });
            parents.pop();
        }
        
        if (modifiers.after) modifiers.after.call(state, state.node);
        
        return state;
    })(root).node;
}

function copy (src) {
    if (typeof src === 'object' && src !== null) {
        var dst;
        
        if (isArray(src)) {
            dst = [];
        }
        else if (isDate(src)) {
            dst = new Date(src);
        }
        else if (isRegExp(src)) {
            dst = new RegExp(src);
        }
        else if (isError(src)) {
            dst = { message: src.message };
        }
        else if (isBoolean(src)) {
            dst = new Boolean(src);
        }
        else if (isNumber(src)) {
            dst = new Number(src);
        }
        else if (isString(src)) {
            dst = new String(src);
        }
        else if (Object.create && Object.getPrototypeOf) {
            dst = Object.create(Object.getPrototypeOf(src));
        }
        else if (src.constructor === Object) {
            dst = {};
        }
        else {
            var proto =
                (src.constructor && src.constructor.prototype)
                || src.__proto__
                || {}
            ;
            var T = function () {};
            T.prototype = proto;
            dst = new T;
        }
        
        forEach(objectKeys(src), function (key) {
            dst[key] = src[key];
        });
        return dst;
    }
    else return src;
}

var objectKeys = Object.keys || function keys (obj) {
    var res = [];
    for (var key in obj) res.push(key)
    return res;
};

function toS (obj) { return Object.prototype.toString.call(obj) }
function isDate (obj) { return toS(obj) === '[object Date]' }
function isRegExp (obj) { return toS(obj) === '[object RegExp]' }
function isError (obj) { return toS(obj) === '[object Error]' }
function isBoolean (obj) { return toS(obj) === '[object Boolean]' }
function isNumber (obj) { return toS(obj) === '[object Number]' }
function isString (obj) { return toS(obj) === '[object String]' }

var isArray = Array.isArray || function isArray (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

forEach(objectKeys(Traverse.prototype), function (key) {
    traverse[key] = function (obj) {
        var args = [].slice.call(arguments, 1);
        var t = new Traverse(obj);
        return t[key].apply(t, args);
    };
});
});

require.define("/node_modules/hat/package.json",function(require,module,exports,__dirname,__filename,process){module.exports = {"main":"index.js"}});

require.define("/node_modules/hat/index.js",function(require,module,exports,__dirname,__filename,process){var hat = module.exports = function (bits, base) {
    if (!base) base = 16;
    if (bits === undefined) bits = 128;
    if (bits <= 0) return '0';
    
    var digits = Math.log(Math.pow(2, bits)) / Math.log(base);
    for (var i = 2; digits === Infinity; i *= 2) {
        digits = Math.log(Math.pow(2, bits / i)) / Math.log(base) * i;
    }
    
    var rem = digits - Math.floor(digits);
    
    var res = '';
    
    for (var i = 0; i < Math.floor(digits); i++) {
        var x = Math.floor(Math.random() * base).toString(base);
        res = x + res;
    }
    
    if (rem) {
        var b = Math.pow(base, rem);
        var x = Math.floor(Math.random() * b).toString(base);
        res = x + res;
    }
    
    var parsed = parseInt(res, base);
    if (parsed !== Infinity && parsed >= Math.pow(2, bits)) {
        return hat(bits, base)
    }
    else return res;
};

hat.rack = function (bits, base, expandBy) {
    var fn = function (data) {
        var iters = 0;
        do {
            if (iters ++ > 10) {
                if (expandBy) bits += expandBy;
                else throw new Error('too many ID collisions, use more bits')
            }
            
            var id = hat(bits, base);
        } while (Object.hasOwnProperty.call(hats, id));
        
        hats[id] = data;
        return id;
    };
    var hats = fn.hats = {};
    
    fn.get = function (id) {
        return fn.hats[id];
    };
    
    fn.set = function (id, value) {
        fn.hats[id] = value;
        return fn;
    };
    
    fn.bits = bits || 128;
    fn.base = base || 16;
    return fn;
};
});

require.define("/common/index.js",function(require,module,exports,__dirname,__filename,process){exports.name = function(val) {
    var name = val.toLowerCase().replace(/ /g,'').replace(/\'/g,'').replace('-','');
    return name;
};
});

require.define("/cards/cards.js",function(require,module,exports,__dirname,__filename,process){var db = require('./db');
var Hash = require('hashish');
var common = require('../common');
var path = require('path');

var cards = {};
Hash(db).forEach(function(list,key) {
    list.forEach(function(card) {
        var expansion = card.expansion;
        if (expansion == 'Dominion') 
            expansion = 'base';
        var dir = expansion.toLowerCase().replace(/ /g,'').replace(/'/g,'');
        var name = common.name(card.name);
        card.path = path.join('img/',dir,'/',name.concat('.jpg'));
        cards[name] = card;
    });
});

exports = module.exports = cards;
});

require.define("/cards/db.js",function(require,module,exports,__dirname,__filename,process){var db = {
  "Prosperity" : [
    {
      "description": "When you play this, it's worth 1 Coin per Treasure card you have in play (counting this).", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 7, 
      "id": 21, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Bank", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "+1VP. Trash a card from your hand. +VP equal to half its cost in coins, rounded down. Each other player may trash a card from his hand.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 1, 
      "cost_treasure": 4, 
      "id": 4, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Bishop", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "If there are one or more empty Supply piles, +1 Card. If there are two or more, +1 Coin and +1 Buy.", 
      "plus_actions": 2, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 9, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "City", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "When you play this, the player to your  left names a card. You can't buy that card this turn.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 10, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Contraband", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 3, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Look through your discard pile, reveal any number of Copper cards from it, and put them into your hand.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 11, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Counting House", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand. Gain a card costing up to 3 Coins more than the trashed card.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 7, 
      "id": 22, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Expand", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash any number of cards from your hand. Gain a card with cost exactly equal to the total cost in coins of the trashed cards.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 7, 
      "id": 23, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Forge", 
      "is_attack": false, 
      "trashes": 5, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player discards down to 3 cards in hand. --While this is in play, when you buy a card, +1VP.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 2, 
      "cost_treasure": 6, 
      "id": 18, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Goons", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "You can't buy this if you have any Copper in play.", 
      "plus_actions": 1, 
      "expansion": "Prosperity", 
      "plus_treasure": 2, 
      "cost_treasure": 6, 
      "id": 19, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Grand Market", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "While this is in play, when you buy a Victory card, gain a Gold.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 20, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Hoard", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 2, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may choose an Action card in your hand. Play it three times.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 7, 
      "id": 24, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "King's Court", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you play this, reveal cards from your deck until you reveal a Treasure. Discard it or trash it. Discard the other cards.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 1, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Loan", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 1, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may reveal a Treasure card from your hand. Gain a copy of it. When you buy this, trash all Treasures you have in play.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 12, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Mint", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "+1VP", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 1, 
      "cost_treasure": 4, 
      "id": 5, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Monument", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player may discard a Curse. If he doesn't, he gains a Curse and a Copper.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 2, 
      "cost_treasure": 5, 
      "id": 13, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Mountebank", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "During your Buy phase, this costs 2 Coins less per Action card you have in play, but not less than 0.", 
      "plus_actions": 1, 
      "expansion": "Prosperity", 
      "plus_treasure": 1, 
      "cost_treasure": 8, 
      "id": 25, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Peddler", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "While this card is in play, Action cards cost 2 Coins less, but not less than 0 Coins.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 6, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Quarry", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 1, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player reveals the top 3 cards of his deck, discard the revealed Actions and Treasures, and puts the rest back on top in any order he chooses.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 14, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Rabble", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 3, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "While this is in play, when you gain a card, you may put it on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 15, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Royal Seal", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 2, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "While this card is in play, when you buy a card costing 4 Coins or less that is not a Victory card, gain a copy of it.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 7, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Talisman", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 1, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "+1 Coin per token on the Trade Route mat. Trash a card from your hand. Setup: Put a token on each Victory card Supply pile. When a card is gained from that pile, Move the token to the Trade Route mat.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 2, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Trade Route", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Discard any number of cards. +1 Coin per card discarded. Each other player may discard 2 cards. If he does, he draws a card.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 16, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Vault", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you play this, reveal cards from your deck until you reveal a Treasure. Discard the other cards. Play that Treasure.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 17, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Venture", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 1, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Draw until you have 6 cards in hand. --When you gain a card, you may reveal this from your hand. If you do, trash that card or put it on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 3, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Watchtower", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 2, 
      "expansion": "Prosperity", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 8, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Worker's Village", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 1
    }
  ], 
  "Hinterlands": [
    {
      "description": "When you gain this, gain a card costing less than this.", 
      "plus_actions": 1, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 50, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Border Village", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you gain this, gain two Coppers.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 40, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Cache", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 3, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Look at the top 4 cards of your deck. Discard any number of them. Put the rest back on top in any order.", 
      "plus_actions": 1, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 41, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Cartographer", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal your hand. +1 per Victory card revealed. If this is the first time you played a Crossroads this turn, +3 Actions.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 26, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Crossroads", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand. Gain a card costing exactly 1 Coin more than it and a card costing exactly 1 Coin less than it, in either order, putting them on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 29, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Develop", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each player (including you) looks at the top card of his deck, and discards it or puts it back. In games using this, when you gain a Duchy, you may gain a Duchess.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 2, 
      "cost_treasure": 2, 
      "id": 27, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Duchess", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard 3 cards. When you gain this, each other player gains a Silver.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 42, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Embassy", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 5, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you buy this, trash a card from your hand. Gain a card costing exactly $2 more than the trashed card.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 51, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Farmland", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 2, 
      "plus_buys": 0
    }, 
    {
      "description": "If this is the first time you played a Fool's Gold this turn, this is worth 1 Coin, otherwise it's worth 4 Coins. When another player gains a Province, you may trash this from your hand. If you do, gain a Gold, putting it on your deck.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 28, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Fool's Gold", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "While this is in play, when you buy a card, gain a card costing less than it that is not a Victory card.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 2, 
      "cost_treasure": 5, 
      "id": 43, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Haggler", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "While this is in play, cards cost $1 less, but not less than $0.", 
      "plus_actions": 1, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 44, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Highway", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you play this, you may gain a Copper, putting it into your hand. When you gain this, each other player gains a Curse.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 45, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Ill-Gotten Gains", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 1, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard 2 cards. When you gain this, look through your discard pile (including this), reveal any number of Action cards from it, and shuffle them into your deck.", 
      "plus_actions": 2, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 46, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Inn", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain a Silver. Look at the top card of your deck; discard it or put it back. Draw until you have 5 cards in hand. You may trash a card from your hand that is not a Treasure.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 34, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Jack of All Trades", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Put a card from your hand on top of your deck. When you gain this, put all Treasures you have in play on top of your deck in any order.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 3, 
      "cost_treasure": 5, 
      "id": 47, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Mandarin", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player draws a card, then discards down to 3 cards in hand.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 48, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Margrave", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 3, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "When you buy this or play it, each other player reveals the top 2 cards of his deck, trashes a revealed Silver or Gold you choose, and discards the rest. If he didn't reveal a Treasure, he gains a Copper. You gain the trashed cards.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 1, 
      "cost_treasure": 4, 
      "id": 35, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Noble Brigand", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you gain this, put it on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 2, 
      "cost_treasure": 4, 
      "id": 36, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Nomad Camp", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Discard a card.", 
      "plus_actions": 1, 
      "expansion": "Hinterlands", 
      "plus_treasure": 1, 
      "cost_treasure": 3, 
      "id": 30, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Oasis", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each player (including you) reveals the top 2 cards of his deck, and you choose one: either he discards them, or he puts them back on top in an order he chooses. +2 Cards.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 31, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Oracle", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "At the start of Clean-up this turn, you may choose an Action card you have in play. If you discard it from play this turn, put it on your deck.", 
      "plus_actions": 1, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 32, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Scheme", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Worth 1 VP for every 4 Victory cards in your deck (round down).", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 37, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Silk Road", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may trash a Treasure from your hand. If you do, choose one:\n+2 Cards and +1 Action; or +$2 and +1 Buy.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 38, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Spice Merchant", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may discard a Treasure. If you do, +3 Cards and +1 Action.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 49, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Stables", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand. Gain a number of Silvers equal to its cost in coins. When you would gain a card, you may reveal this from your hand. If you do, instead, gain a Silver.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 39, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Trader", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you discard this other than during a Clean-up phase, you may reveal it. If you do, gain a Gold.", 
      "plus_actions": 0, 
      "expansion": "Hinterlands", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 33, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Tunnel", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 2, 
      "plus_buys": 0
    }
  ], 
  "Cornucopia": [
    {
      "description": "Worth 2 VP for every 5 differnly named cards in your deck (rounded down).", 
      "plus_actions": 0, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 64, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Fairgrounds", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal cards from the top of your deck until you reveal an Action or Treasure card. Put that card into your hand and discard the other cards.", 
      "plus_actions": 2, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 55, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Farming Village", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player reveals cards from the top of his deck until he reveals a Victory or Curse card. He puts it on top and discards the other revealed cards.", 
      "plus_actions": 0, 
      "expansion": "Cornucopia", 
      "plus_treasure": 2, 
      "cost_treasure": 3, 
      "id": 53, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Fortune Teller", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may discard a card; If you do, +1 Action. \nYou may discard a card; If you do, +1 Buy.", 
      "plus_actions": 1, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 52, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Hamlet", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal the top 4 cards of your deck, then discard them. +1 Coin per differently named card revealed.", 
      "plus_actions": 0, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 60, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Harvest", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you play this, gain a card costing up to 1 Coin per differently named card you have in play, counting this. If it's a Victory card, trash this.", 
      "plus_actions": 0, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 61, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Horn of Plenty", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard 2 cards. When another player plays an Attack card, you may set this aside from your hand. If you do, then at the start of your next turn, +1 Card and return this to your hand.", 
      "plus_actions": 0, 
      "expansion": "Cornucopia", 
      "plus_treasure": 3, 
      "cost_treasure": 4, 
      "id": 56, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Horse Traders", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Reveal your hand. Reveal cards from your deck until you reveal a card that isn't a duplicate of one in your hand and discard the rest.", 
      "plus_actions": 1, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 62, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Hunting Party", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player discards the top card of his deck. If it's a Victory card he gains a Curse. Otherwise he gains a copy of the discarded card or you do, your choice.", 
      "plus_actions": 0, 
      "expansion": "Cornucopia", 
      "plus_treasure": 2, 
      "cost_treasure": 5, 
      "id": 63, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Jester", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal your hand. If there are no duplicate cards in it, +3 Cards.\nOtherwise, +1 Card.", 
      "plus_actions": 1, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 54, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Menagerie", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Do this twice: Trash a card from your hand then gain a card costing exactly 1 more than the trashed card.", 
      "plus_actions": 0, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 57, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Remake", 
      "is_attack": false, 
      "trashes": 2, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each player may reveal a Province from his hand. If you do, discard it and gain a Prize (from the Prize pile) or a Duchy, putting it on top of your deck. If no-one else does, +1 Card +1 Coin.", 
      "plus_actions": 1, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 58, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Tournament", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard 2 cards. Each other player may reveal a Bane card from his hand.\nIf he doesn't, he gains a Curse. Setup: Add an extra Kingdom card pile costing 2 or 3 to the Supply. Cards from that pile are Bane cards.", 
      "plus_actions": 0, 
      "expansion": "Cornucopia", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 59, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Young Witch", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }
  ], 
  "Promo": [
    {
      "description": "Reveal the top 3 cards of the Black Market deck. You may buy one of them immediately. Put the unbought cards on the bottom of the Black Market deck in any order. (Before the game, make a Black Market deck out of one copy of each Kingdom card not in the supply.)", 
      "plus_actions": 0, 
      "expansion": "Promo", 
      "plus_treasure": 2, 
      "cost_treasure": 3, 
      "id": 304, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Black Market", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal the top 5 cards of your deck. The player to your left chooses one for you to dicard. Draw the rest.", 
      "plus_actions": 0, 
      "expansion": "Promo", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 305, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Envoy", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: you get the version in parentheses. Each player gets +1 (+3) Cards; or each player gains a Silver (Gold); or each player may trash a card from his hand and gain a card costing exactly 1 (2) more.", 
      "plus_actions": 1, 
      "expansion": "Promo", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 307, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Governor", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you shuffle, you may put this anywhere in your deck.", 
      "plus_actions": 0, 
      "expansion": "Promo", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 308, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Stash", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 2, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "At the start of Clean-up, if you have this and no more than one other Action card in play, you may put this on top of your deck.", 
      "plus_actions": 1, 
      "expansion": "Promo", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 306, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Walled Village", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }
  ], 
  "Seaside": [
    {
      "description": "Reveal a card from your hand.  Return up to 2 copies of it from your hand to the Supply.  Then each player gains a copy of it.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 70, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Ambassador", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 2, 
      "expansion": "Seaside", 
      "plus_treasure": 1, 
      "cost_treasure": 5, 
      "id": 83, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Bazaar", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "At the start of your next turn, +1 Card.", 
      "plus_actions": 1, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 75, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Caravan", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player discards a Copper card (or reveals a hand with no Copper).", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 2, 
      "cost_treasure": 4, 
      "id": 76, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Cutpurse", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash this card. Put an Embargo token on top of a Supply pile. (When you buy a card with an Embargo token on it, gain a Curse)", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 2, 
      "cost_treasure": 2, 
      "id": 65, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Embargo", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may reveal a Province card from your hand. If you do, gain a Gold card, putting it into your hand. Otherwise, gain a Silver card, putting it into your hand.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 84, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Explorer", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "At the start of your next turn: +1 Action, +1 Coin.", 
      "plus_actions": 2, 
      "expansion": "Seaside", 
      "plus_treasure": 1, 
      "cost_treasure": 3, 
      "id": 71, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Fishing Village", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player with 4 or more cards in hand puts cards from his hand on top of his deck until he has 3 cards in his hand.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 85, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Ghost Ship", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Set aside a card from your hand face down. At the start of your next turn, put it into your hand.", 
      "plus_actions": 1, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 66, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Haven", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Set aside this and another card from your hand. Return them to your deck at the end of the game.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 77, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Island", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 2, 
      "plus_buys": 0
    }, 
    {
      "description": "Now and at the start of your next turn: +1 Coin. While this is in play, when another player plays an Attack card, it doesn't affect you.", 
      "plus_actions": 1, 
      "expansion": "Seaside", 
      "plus_treasure": 1, 
      "cost_treasure": 2, 
      "id": 67, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Lighthouse", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Look at the top 3 cards of your deck. Trash one of them. Discard one of them. Put the other one on top of your deck.", 
      "plus_actions": 1, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 72, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Lookout", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Now and at the start of your next turn: +2 Coins.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 2, 
      "cost_treasure": 5, 
      "id": 86, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Merchant Ship", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: Set aside the top card of your deck face down on your Native Village mat; or put all the cards from your mat into your hand. You may look at the cards on your may at any time; return them to your deck at the end of the game.", 
      "plus_actions": 2, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 68, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Native Village", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Look at the top 5 cards of your deck. Either discard all of them, or put them back on top of your deck in any order.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 2, 
      "cost_treasure": 4, 
      "id": 78, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Navigator", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You only draw 3 cards (instead of 5) in this turn's Clean-up phase. Take an extra turn after this one. This can't cause you to take more than two consecutive  turns.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 87, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Outpost", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Look at the bottom card of your deck. You may put it on top.", 
      "plus_actions": 1, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 69, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Pearl Diver", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: Each other player reveals the top 2 cards of his deck, trashes a revealed Treasure that you choose, discards the rest, and if anyone trashed a Treasure you take a Coin token; or +1 Coin per Coin token you've taken with Pirate Ships this game.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 79, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Pirate Ship", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your  hand. +Coins equal to its cost.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 80, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Salvager", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Each other player discards the top card of his deck, then gains a Curse card, putting it on top of his deck.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 81, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Sea Hag", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain a copy of a card costing up to 6 Coins that the player to your right gained on his last turn.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 73, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Smugglers", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard your hand. If you discarded any cards this way, then at the start of your  next turn, +5 Cards, +1 Buy, and +1 Action.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 88, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Tactician", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash this and another copy of Treasure Map from your hand. If you do trash two Treasure Maps, gain 4 Gold cards, putting them on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 82, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Treasure Map", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you discard this from play, if you didn't buy a Victory card this turn, you may put this on top of your deck.", 
      "plus_actions": 1, 
      "expansion": "Seaside", 
      "plus_treasure": 1, 
      "cost_treasure": 5, 
      "id": 89, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Treasury", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard 3 cards.", 
      "plus_actions": 1, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 74, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Warehouse", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 3, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Now and at the start of your next turn: +2 Cards, +1 Buy.", 
      "plus_actions": 0, 
      "expansion": "Seaside", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 90, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Wharf", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 1
    }
  ], 
  "Intrigue": [
    {
      "description": "You may discard an Estate card.  If you do, +4 Coins. Otherwise, gain an Estate card.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 137, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Baron", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "All cards (including cards in players' hands) cost 1 Coin less this turn, but not less than 0.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 1, 
      "cost_treasure": 4, 
      "id": 138, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Bridge", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "If you've played 3 or more Actions this turn (counting this): +1 Card, +1 Action.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 2, 
      "cost_treasure": 4, 
      "id": 139, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Conspirator", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Copper produces an extra 1 Coin this turn.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 140, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Coppersmith", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Put a card from your hand on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 128, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Courtyard", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 3, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Worth 1VP per Duchy you have.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 144, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Duke", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 1, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 131, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Great Hall", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 1, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 151, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Harem", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 2, 
      "plus_cards": 0, 
      "victory_points": 2, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain a card costing up to 4 Coins. If it is an Action card, +1 Action; Treasure card, +1 Coin; or Victory card, +1 Card.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 141, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Ironworks", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each player passes a card from his hand o the left once. Then you may trash a card from your hand.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 132, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Masquerade", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may trash this card immediately. If you do, +2 Coins.", 
      "plus_actions": 2, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 142, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Mining Village", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: +2 Coins; or discard your hand, +4 Cards, and each other player with at least 5 cards in hand discards his hand and draws 4 cards.", 
      "plus_actions": 1, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 145, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Minion", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: +3 Cards; or +2 Actions.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 152, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Nobles", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 2, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose two: +1 Card; +1 Action; +1 Buy; +1 Coin. (The choices must be different.)", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 129, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Pawn", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player reveals cards from the top of his deck until revealing one costing 3 Coins or more. He trashes that card and may gain a card costing at most 2 less than it. He discards the other revealed cards.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 146, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Saboteur", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal the top 4 cards of your deck. Put the revealed Victory cards into your hand. Put the other cards on top of your deck in any order.", 
      "plus_actions": 1, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 143, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Scout", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard any number of cards. +1 Coin per card discarded. When another player plays an Attack card, you may reveal this card from your hand. If you do, +2 Cards, then put 2 cards from your hand to the top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 130, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Secret Chamber", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal your hand. If you have no Action cards in hand, +2 Cards.", 
      "plus_actions": 2, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 133, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Shanty Town", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: +2 Cards; or +2 Coins; or trash 2 cards from your hand.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 2, 
      "cost_treasure": 3, 
      "id": 134, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Steward", 
      "is_attack": false, 
      "trashes": 2, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player trashes the top card of his deck and gains a card with the same cost that you choose.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 2, 
      "cost_treasure": 3, 
      "id": 135, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Swindler", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player chooses one: he discards 2 cards; or he gains a Curse card, putting it in his hand.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 147, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Torturer", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 3, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash 2 cards from your hand. If you do, gain a Silver card; put it into your hand.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 148, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Trading Post", 
      "is_attack": false, 
      "trashes": 2, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "The player to your left reveals then discards the top 2 cards of his deck. For each differently named card revealed, if it is an\u2026Action card, +2 Actions; Treasure card, +2 Coins; or Victory card, +2 Cards.", 
      "plus_actions": 0, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 149, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Tribute", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand. Gain a card costing exactly 1 Coin more than it.", 
      "plus_actions": 1, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 150, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Upgrade", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Name a card. Reveal the top card of your deck. If it's the named card, put it into your hand.", 
      "plus_actions": 1, 
      "expansion": "Intrigue", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 136, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Wishing Well", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }
  ], 
  "Alchemy": [
    {
      "description": "When you discard this from play, you may put this on top of your deck if you have a Potion in play.", 
      "plus_actions": 1, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 96, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Alchemist", 
      "is_attack": false, 
      "trashes": null, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal the top 4 cards of your deck.  Put the revealed Coppers and Potions into your hand. Put the other cards back on top of your deck in any order.", 
      "plus_actions": 1, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 92, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Apothecary", 
      "is_attack": false, 
      "trashes": null, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand. +1 Card per Coin it costs.  +2 Cards if there is a Potion in the cost.", 
      "plus_actions": 1, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 100, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Apprentice", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player gains a Curse.", 
      "plus_actions": 1, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 97, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Familiar", 
      "is_attack": true, 
      "trashes": null, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal cards from your deck until you reveal 2 Action cards other than Golem cards. Discard the other cards, then play the Action cards in either order.", 
      "plus_actions": 0, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 99, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Golem", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you discard this from play, you may put one of your Treasures from play on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Alchemy", 
      "plus_treasure": 1, 
      "cost_treasure": 2, 
      "id": 93, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Herbalist", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "When you play this card, count your deck and discard pile. Worth 1 Coin per 5 cards total between them (rounded down).", 
      "plus_actions": 0, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 98, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Philosopher's Stone", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "The player to your left takes an extra turn after this one, in which you can see all cards he can and make all decisions for him. Any cards he would gain on that turn, you gain instead; any cards of his that are trashed are set aside and returned to his discard pile at the end of the turn.", 
      "plus_actions": 0, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 101, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Possession", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each player (including you) reveals the top card of his deck and either discards it or puts it back, your choice. Then, reveal cards from your deck until you reveal a card that is not an action. Take all of these revealed cards into your hand.", 
      "plus_actions": 1, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 94, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Scrying Pool", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand. If it is an...Action card, gain a Duchy; Treasure card, gain a Transmute; or Victory card, gain a Gold.", 
      "plus_actions": 0, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 1, 
      "id": 91, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Transmute", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may gain an Action card costing up to 5 Coins.", 
      "plus_actions": 2, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 95, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "University", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Worth 1VP for every 3 Action cards in your deck (rounded down).", 
      "plus_actions": 0, 
      "expansion": "Alchemy", 
      "plus_treasure": 0, 
      "cost_treasure": 0, 
      "id": 102, 
      "cost_potions": 1, 
      "is_reaction": false, 
      "name": "Vineyard", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }
  ], 
  "Dominion": [
    {
      "description": "Reveal cards from your deck until you reveal 2 Treasure  cards. Put those Treasure cards into your hand and discard the other revealed cards.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 127, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Adventurer", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain a Silver card; put it on top of your deck. Each other player reveals a Victory card from his hand and puts it on his deck (or reveals a hand with no Victory cards).", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 110, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Bureaucrat", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard any number of cards. +1 Card per card discarded.", 
      "plus_actions": 1, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 103, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Cellar", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may immediately put your deck into your discard pile.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 2, 
      "cost_treasure": 3, 
      "id": 106, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Chancellor", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash up to 4 cards from your hand.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 104, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Chapel", 
      "is_attack": false, 
      "trashes": 4, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player draws a card.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 120, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Council Room", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 4, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Trash this card. Gain a card costing  up to 5 Coins.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 111, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Feast", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 2, 
      "expansion": "Dominion", 
      "plus_treasure": 2, 
      "cost_treasure": 5, 
      "id": 121, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Festival", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Worth 1VP for every 10 cards in your deck (rounded down).", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 112, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Gardens", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 1, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 122, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Laboratory", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Draw until you have 7 cards in hand. You may set aside any Action cards drawn this way, as you draw them; discard the set aside cards after you finish drawing.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 123, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Library", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 1, 
      "expansion": "Dominion", 
      "plus_treasure": 1, 
      "cost_treasure": 5, 
      "id": 124, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Market", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Each other player discards down to 3 cards in his hand.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 2, 
      "cost_treasure": 4, 
      "id": 113, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Militia", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a Treasure card from your hand. Gain a Treasure card costing up to 3 more; put it into your hand.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 125, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Mine", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When another player plays an Attack card, you may reveal this from your hand. If you do, you are unaffected by that Attack.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 105, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Moat", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a Copper card from your hand. If you do, +3 Coins.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 114, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Moneylender", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand. Gain a card costing up to 2 Coins more than the trashed card.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 115, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Remodel", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 116, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Smithy", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 3, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each player (including you) reveals the top card of his deck and either discards it or puts it back, your choice.", 
      "plus_actions": 1, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 117, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Spy", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player reveals the top 2 cards of his deck. If they revealed any Treasure cards, they trash one of them that you choose. You may gain any or all of these trashed cards. They discard the other revealed cards.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 118, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Thief", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose an Action card in your  hand. Play it twice.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 119, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Throne Room", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 2, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 107, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Village", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Each other player gains a Curse card.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 126, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Witch", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 2, 
      "cost_treasure": 3, 
      "id": 108, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Woodcutter", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Gain a card costing up to 4 Coins.", 
      "plus_actions": 0, 
      "expansion": "Dominion", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 109, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Workshop", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }
  ], 
  "Dark Ages": [
    {
      "description": "Trash a card from your hand. Gain a card costing up to $5.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 309, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Altar", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain a card costing up to $4. Put it on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 310, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Armory", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain a Spoils.", 
      "plus_actions": 2, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 312, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Bandit Camp", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Play this as if it were an Action card in the Supply costing less than it that you choose. This is that card until it leaves play.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 311, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Band of Misfits", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain 3 Coppers, putting them into your hand.\n___\nWhen another player plays an Attack card, you may discard this. If you do, gain two Silvers, putting one on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 313, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Beggar", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Look at the top 3 cards of your deck. Choose one: Put them into your hand; or discard them and +3 Cards.\n___\nWhen you trash this, gain a cheaper card.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 314, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Catacombs", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: Discard 2 cards; put a card from your hand on top of your deck; or gain a Copper.\nChoose one: +$3; trash your hand; or gain a Duchy.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 315, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Count", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you play this, you may play a treasure from your hand twice. If you do, trash that treasure.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 316, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Counterfeit", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 1, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Each other player gains a Ruins. You may play a Cultist from your hand.\n___\nWhen you trash this, +3 Cards.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 317, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Cultist", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 2, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may trash an Action card from your hand. If you don\u2019t, trash this.\n___\nWhen you gain this, gain two Ruins.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 5, 
      "cost_treasure": 4, 
      "id": 318, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Death Cart", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Worth 1 VP for every 3 Silvers in your deck.\n___\nWhen you trash this, gain 3 Silvers.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 319, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Feodum", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 4, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand. +$1 per differently named Treasure in the trash.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 320, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Forager", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "When you trash this, put it into your hand.", 
      "plus_actions": 2, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 321, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Fortress", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: Gain a card from the trash costing from $3 to $6, putting it on top of your deck; or trash an Action card from your hand and gain a card costing up to $3 more than it.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 322, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Graverobber", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Look through your discard pile. You may trash a card that is not a Treasure, from your discard pile or your hand. Gain a card costing up to $3.\n___\nWhen you discard this from play, if you didn\u2019t buy any cards this turn, trash this and gain a Madman (from the Madman pile).", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 323, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Hermit", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When this is trashed, gain a Duchy or 3 Estates", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 6, 
      "id": 324, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Hunting Grounds", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 4, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal the top card of your deck; you may discard it. If it is an Action card, +1 Action; a Treasure card, +$1; a Victory card, +1 Card.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 325, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Ironmonger", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash a card from your hand.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 1, 
      "cost_treasure": 5, 
      "id": 326, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Junk Dealer", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Dame Anna"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Dame Josephine"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Dame Molly"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Dame Natalie"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Dame Sylvia"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Sir Bailey"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Sir Destry"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Sir Martin"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Sir Michael"
    }, 
    {
      "expansion": "Dark Ages", 
      "type" : "Knight",
      "name": "Sir Vander"
    }, 
    {
      "description": "Return this to the Madman pile. If you do, +1 Card per card in your hand.\n(This is not in the Supply.)", 
      "plus_actions": 2, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 0, 
      "id": 327, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Madman", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain a Spoils. Each other player gains a Ruins.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 328, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Marauder", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When one of your cards is trashed, you may discard this from your hand. If you do, gain a Gold.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 329, 
      "cost_potions": 0, 
      "is_reaction": true, 
      "name": "Market Square", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "You may trash 2 cards from your hand. If you do, +2 Cards, + $2, and each other player discards down to 3 cards in hand.\n(This is not in the Supply.)", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 0, 
      "id": 330, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Mercenary", 
      "is_attack": true, 
      "trashes": 2, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Name a card. Reveal the top card of your deck. If it\u2019s the named card, put it into your hand.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 2, 
      "cost_treasure": 5, 
      "id": 331, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Mystic", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Trash this. Each other player with 5 or more cards in hand reveals his hand and discards a card that you choose. Gain 2 Spoils.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 332, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Pillage", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal your hand. -$1 per Treasure card in your hand, to a minimum of $0.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 4, 
      "cost_treasure": 1, 
      "id": 333, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Poor House", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may play an Action card from your hand twice. Trash it. Gain an Action card costing exactly $1 more than it.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 334, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Procession", 
      "is_attack": false, 
      "trashes": 1, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Gain a Rats. Trash a card from your hand other than a Rats (or reveal a hand of all Rats).\n___\nWhen this is trashed, +1 Card.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 335, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Rats", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Name a card. Reveal cards from the top of your deck until you reveal a Victory card that is not the named card. Discard the other cards. Trash the Victory card and gain a Victory card costing up to $3 more than it.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 5, 
      "id": 336, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Rebuild", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "If there are any cards in the trash costing from $3 to $6, gain one of them. Otherwise, each other player reveals the top 2 cards of his deck, trashes one of them costing from $3 to $6, and discards the rest.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 2, 
      "cost_treasure": 5, 
      "id": 337, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Rogue", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal cards from the top of your deck until you reveal one costing $3 or more. Put that card into your hand and discard the rest.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 338, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Sage", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "You may put your deck into your discard pile. Look through your discard pile and put one card from it on top of your deck.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 2, 
      "cost_treasure": 4, 
      "id": 339, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Scavenger", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "When you play this, return it to the pile.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 0, 
      "id": 340, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Spoils", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 3, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Choose one: +2 Actions; or +2 Buys; or gain a Silver.\n___\nWhen you trash this, gain an Attack card.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 1, 
      "cost_treasure": 2, 
      "id": 341, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Squire", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Discard any number of cards. +1 Card per card discarded. Discard any number of cards. +$1 per card discarded the second time.", 
      "plus_actions": 0, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 342, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Storeroom", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 0, 
      "victory_points": 0, 
      "plus_buys": 1
    }, 
    {
      "description": "Each other player discards down to 4 cards in hand.\n___\nWhen you play another Attack card with this in play, you may trash this. If you do, gain a Mercenary from the Mercenary pile.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 3, 
      "id": 343, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Urchin", 
      "is_attack": true, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal the top card of your deck. If it\u2019s a Victory card, Curse, Ruins, or Shelter, put it into your hand.", 
      "plus_actions": 1, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 2, 
      "id": 344, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Vagrant", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }, 
    {
      "description": "Reveal the top 3 cards of your deck. Put the Actions back on top in any order and discard the rest.", 
      "plus_actions": 2, 
      "expansion": "Dark Ages", 
      "plus_treasure": 0, 
      "cost_treasure": 4, 
      "id": 345, 
      "cost_potions": 0, 
      "is_reaction": false, 
      "name": "Wandering Minstrel", 
      "is_attack": false, 
      "trashes": 0, 
      "treasure": 0, 
      "plus_cards": 1, 
      "victory_points": 0, 
      "plus_buys": 0
    }
  ]
};


exports = module.exports = db;
});

require.define("/bundle/start.js",function(require,module,exports,__dirname,__filename,process){var address = window.location.host;
var dz = io.connect('http://'+address);
var Hash = require('hashish');
var hat = require('hat');
var rack = hat.rack(128,10,2);
var common = require('../common');
var cards = require('../cards/cards');

var hand = ['Cellar','Bank','City','Market','Village'];

var small = function(path) {
    var base = path.slice(0,path.indexOf('.'));
    return base + '_small.jpg';
};

var focus = function(id) {
    id = id.slice(1);
    var name = rack.get(id);
    var card = cards[name];
    $('#focus').empty().append("<img src='"+card.path + "' >");
}
$(window).ready(function() {
    hand.forEach(function(key){ 
        var card = cards[common.name(key)];
        var id = rack(common.name(key));
        $('#hand').append("<div class='card'><img id='_"+id + "' src='"+small(card.path) + "'></div>");
        $('#_'+id).mouseover(function() {
            focus(this.id);
        });
//        $('#cards').append("<img src='"+card.path + "'>");
    });
});
});
require("/bundle/start.js");
})();
