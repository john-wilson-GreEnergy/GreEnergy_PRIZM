var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/adm-zip/util/constants.js
var require_constants = __commonJS({
  "node_modules/adm-zip/util/constants.js"(exports2, module2) {
    module2.exports = {
      /* The local file header */
      LOCHDR: 30,
      // LOC header size
      LOCSIG: 67324752,
      // "PK\003\004"
      LOCVER: 4,
      // version needed to extract
      LOCFLG: 6,
      // general purpose bit flag
      LOCHOW: 8,
      // compression method
      LOCTIM: 10,
      // modification time (2 bytes time, 2 bytes date)
      LOCCRC: 14,
      // uncompressed file crc-32 value
      LOCSIZ: 18,
      // compressed size
      LOCLEN: 22,
      // uncompressed size
      LOCNAM: 26,
      // filename length
      LOCEXT: 28,
      // extra field length
      /* The Data descriptor */
      EXTSIG: 134695760,
      // "PK\007\008"
      EXTHDR: 16,
      // EXT header size
      EXTCRC: 4,
      // uncompressed file crc-32 value
      EXTSIZ: 8,
      // compressed size
      EXTLEN: 12,
      // uncompressed size
      /* The central directory file header */
      CENHDR: 46,
      // CEN header size
      CENSIG: 33639248,
      // "PK\001\002"
      CENVEM: 4,
      // version made by
      CENVER: 6,
      // version needed to extract
      CENFLG: 8,
      // encrypt, decrypt flags
      CENHOW: 10,
      // compression method
      CENTIM: 12,
      // modification time (2 bytes time, 2 bytes date)
      CENCRC: 16,
      // uncompressed file crc-32 value
      CENSIZ: 20,
      // compressed size
      CENLEN: 24,
      // uncompressed size
      CENNAM: 28,
      // filename length
      CENEXT: 30,
      // extra field length
      CENCOM: 32,
      // file comment length
      CENDSK: 34,
      // volume number start
      CENATT: 36,
      // internal file attributes
      CENATX: 38,
      // external file attributes (host system dependent)
      CENOFF: 42,
      // LOC header offset
      /* The entries in the end of central directory */
      ENDHDR: 22,
      // END header size
      ENDSIG: 101010256,
      // "PK\005\006"
      ENDSUB: 8,
      // number of entries on this disk
      ENDTOT: 10,
      // total number of entries
      ENDSIZ: 12,
      // central directory size in bytes
      ENDOFF: 16,
      // offset of first CEN header
      ENDCOM: 20,
      // zip file comment length
      END64HDR: 20,
      // zip64 END header size
      END64SIG: 117853008,
      // zip64 Locator signature, "PK\006\007"
      END64START: 4,
      // number of the disk with the start of the zip64
      END64OFF: 8,
      // relative offset of the zip64 end of central directory
      END64NUMDISKS: 16,
      // total number of disks
      ZIP64SIG: 101075792,
      // zip64 signature, "PK\006\006"
      ZIP64HDR: 56,
      // zip64 record minimum size
      ZIP64LEAD: 12,
      // leading bytes at the start of the record, not counted by the value stored in ZIP64SIZE
      ZIP64SIZE: 4,
      // zip64 size of the central directory record
      ZIP64VEM: 12,
      // zip64 version made by
      ZIP64VER: 14,
      // zip64 version needed to extract
      ZIP64DSK: 16,
      // zip64 number of this disk
      ZIP64DSKDIR: 20,
      // number of the disk with the start of the record directory
      ZIP64SUB: 24,
      // number of entries on this disk
      ZIP64TOT: 32,
      // total number of entries
      ZIP64SIZB: 40,
      // zip64 central directory size in bytes
      ZIP64OFF: 48,
      // offset of start of central directory with respect to the starting disk number
      ZIP64EXTRA: 56,
      // extensible data sector
      /* Compression methods */
      STORED: 0,
      // no compression
      SHRUNK: 1,
      // shrunk
      REDUCED1: 2,
      // reduced with compression factor 1
      REDUCED2: 3,
      // reduced with compression factor 2
      REDUCED3: 4,
      // reduced with compression factor 3
      REDUCED4: 5,
      // reduced with compression factor 4
      IMPLODED: 6,
      // imploded
      // 7 reserved for Tokenizing compression algorithm
      DEFLATED: 8,
      // deflated
      ENHANCED_DEFLATED: 9,
      // enhanced deflated
      PKWARE: 10,
      // PKWare DCL imploded
      // 11 reserved by PKWARE
      BZIP2: 12,
      //  compressed using BZIP2
      // 13 reserved by PKWARE
      LZMA: 14,
      // LZMA
      // 15-17 reserved by PKWARE
      IBM_TERSE: 18,
      // compressed using IBM TERSE
      IBM_LZ77: 19,
      // IBM LZ77 z
      AES_ENCRYPT: 99,
      // WinZIP AES encryption method
      /* General purpose bit flag */
      // values can obtained with expression 2**bitnr
      FLG_ENC: 1,
      // Bit 0: encrypted file
      FLG_COMP1: 2,
      // Bit 1, compression option
      FLG_COMP2: 4,
      // Bit 2, compression option
      FLG_DESC: 8,
      // Bit 3, data descriptor
      FLG_ENH: 16,
      // Bit 4, enhanced deflating
      FLG_PATCH: 32,
      // Bit 5, indicates that the file is compressed patched data.
      FLG_STR: 64,
      // Bit 6, strong encryption (patented)
      // Bits 7-10: Currently unused.
      FLG_EFS: 2048,
      // Bit 11: Language encoding flag (EFS)
      // Bit 12: Reserved by PKWARE for enhanced compression.
      // Bit 13: encrypted the Central Directory (patented).
      // Bits 14-15: Reserved by PKWARE.
      FLG_MSK: 4096,
      // mask header values
      /* Load type */
      FILE: 2,
      BUFFER: 1,
      NONE: 0,
      /* 4.5 Extensible data fields */
      EF_ID: 0,
      EF_SIZE: 2,
      /* Header IDs */
      ID_ZIP64: 1,
      ID_AVINFO: 7,
      ID_PFS: 8,
      ID_OS2: 9,
      ID_NTFS: 10,
      ID_OPENVMS: 12,
      ID_UNIX: 13,
      ID_FORK: 14,
      ID_PATCH: 15,
      ID_X509_PKCS7: 20,
      ID_X509_CERTID_F: 21,
      ID_X509_CERTID_C: 22,
      ID_STRONGENC: 23,
      ID_RECORD_MGT: 24,
      ID_X509_PKCS7_RL: 25,
      ID_IBM1: 101,
      ID_IBM2: 102,
      ID_POSZIP: 18064,
      EF_ZIP64_OR_32: 4294967295,
      EF_ZIP64_OR_16: 65535,
      EF_ZIP64_SUNCOMP: 0,
      EF_ZIP64_SCOMP: 8,
      EF_ZIP64_RHO: 16,
      EF_ZIP64_DSN: 24
    };
  }
});

// node_modules/adm-zip/util/errors.js
var require_errors = __commonJS({
  "node_modules/adm-zip/util/errors.js"(exports2) {
    var errors = {
      /* Header error messages */
      INVALID_LOC: "Invalid LOC header (bad signature)",
      INVALID_CEN: "Invalid CEN header (bad signature)",
      INVALID_END: "Invalid END header (bad signature)",
      /* Descriptor */
      DESCRIPTOR_NOT_EXIST: "No descriptor present",
      DESCRIPTOR_UNKNOWN: "Unknown descriptor format",
      DESCRIPTOR_FAULTY: "Descriptor data is malformed",
      /* ZipEntry error messages*/
      NO_DATA: "Nothing to decompress",
      BAD_CRC: "CRC32 checksum failed {0}",
      FILE_IN_THE_WAY: "There is a file in the way: {0}",
      UNKNOWN_METHOD: "Invalid/unsupported compression method",
      /* Inflater error messages */
      AVAIL_DATA: "inflate::Available inflate data did not terminate",
      INVALID_DISTANCE: "inflate::Invalid literal/length or distance code in fixed or dynamic block",
      TO_MANY_CODES: "inflate::Dynamic block code description: too many length or distance codes",
      INVALID_REPEAT_LEN: "inflate::Dynamic block code description: repeat more than specified lengths",
      INVALID_REPEAT_FIRST: "inflate::Dynamic block code description: repeat lengths with no first length",
      INCOMPLETE_CODES: "inflate::Dynamic block code description: code lengths codes incomplete",
      INVALID_DYN_DISTANCE: "inflate::Dynamic block code description: invalid distance code lengths",
      INVALID_CODES_LEN: "inflate::Dynamic block code description: invalid literal/length code lengths",
      INVALID_STORE_BLOCK: "inflate::Stored block length did not match one's complement",
      INVALID_BLOCK_TYPE: "inflate::Invalid block type (type == 3)",
      /* ADM-ZIP error messages */
      CANT_EXTRACT_FILE: "Could not extract the file",
      CANT_OVERRIDE: "Target file already exists",
      DISK_ENTRY_TOO_LARGE: "Number of disk entries is too large",
      NO_ZIP: "No zip file was loaded",
      NO_ENTRY: "Entry doesn't exist",
      DIRECTORY_CONTENT_ERROR: "A directory cannot have content",
      FILE_NOT_FOUND: 'File not found: "{0}"',
      NOT_IMPLEMENTED: "Not implemented",
      INVALID_FILENAME: "Invalid filename",
      INVALID_FORMAT: "Invalid or unsupported zip format. No END header found",
      INVALID_PASS_PARAM: "Incompatible password parameter",
      WRONG_PASSWORD: "Wrong Password",
      /* ADM-ZIP */
      COMMENT_TOO_LONG: "Comment is too long",
      // Comment can be max 65535 bytes long (NOTE: some non-US characters may take more space)
      EXTRA_FIELD_PARSE_ERROR: "Extra field parsing error"
    };
    function E(message) {
      return function(...args) {
        if (args.length) {
          message = message.replace(/\{(\d)\}/g, (_, n) => args[n] || "");
        }
        return new Error("ADM-ZIP: " + message);
      };
    }
    for (const msg of Object.keys(errors)) {
      exports2[msg] = E(errors[msg]);
    }
  }
});

// node_modules/adm-zip/util/utils.js
var require_utils = __commonJS({
  "node_modules/adm-zip/util/utils.js"(exports2, module2) {
    var fsystem = require("fs");
    var pth = require("path");
    var Constants = require_constants();
    var Errors = require_errors();
    var isWin = typeof process === "object" && "win32" === process.platform;
    var is_Obj = (obj) => typeof obj === "object" && obj !== null;
    var crcTable = new Uint32Array(256).map((t, c) => {
      for (let k = 0; k < 8; k++) {
        if ((c & 1) !== 0) {
          c = 3988292384 ^ c >>> 1;
        } else {
          c >>>= 1;
        }
      }
      return c >>> 0;
    });
    function Utils(opts) {
      this.sep = pth.sep;
      this.fs = fsystem;
      if (is_Obj(opts)) {
        if (is_Obj(opts.fs) && typeof opts.fs.statSync === "function") {
          this.fs = opts.fs;
        }
      }
    }
    module2.exports = Utils;
    Utils.prototype.makeDir = function(folder) {
      const self = this;
      function mkdirSync(fpath) {
        let resolvedPath = fpath.split(self.sep)[0];
        fpath.split(self.sep).forEach(function(name) {
          if (!name || name.substr(-1, 1) === ":") return;
          resolvedPath += self.sep + name;
          var stat;
          try {
            stat = self.fs.statSync(resolvedPath);
          } catch (e) {
            if (e.message && e.message.startsWith("ENOENT")) {
              self.fs.mkdirSync(resolvedPath);
            } else {
              throw e;
            }
          }
          if (stat && stat.isFile()) throw Errors.FILE_IN_THE_WAY(`"${resolvedPath}"`);
        });
      }
      mkdirSync(folder);
    };
    Utils.prototype.writeFileTo = function(path, content, overwrite, attr) {
      const self = this;
      if (self.fs.existsSync(path)) {
        if (!overwrite) return false;
        var stat = self.fs.statSync(path);
        if (stat.isDirectory()) {
          return false;
        }
      }
      var folder = pth.dirname(path);
      if (!self.fs.existsSync(folder)) {
        self.makeDir(folder);
      }
      var fd;
      try {
        fd = self.fs.openSync(path, "w", 438);
      } catch (e) {
        self.fs.chmodSync(path, 438);
        fd = self.fs.openSync(path, "w", 438);
      }
      if (fd) {
        try {
          self.fs.writeSync(fd, content, 0, content.length, 0);
        } finally {
          self.fs.closeSync(fd);
        }
      }
      self.fs.chmodSync(path, attr || 438);
      return true;
    };
    Utils.prototype.writeFileToAsync = function(path, content, overwrite, attr, callback) {
      if (typeof attr === "function") {
        callback = attr;
        attr = void 0;
      }
      const self = this;
      self.fs.exists(path, function(exist) {
        if (exist && !overwrite) return callback(false);
        self.fs.stat(path, function(err, stat) {
          if (exist && stat.isDirectory()) {
            return callback(false);
          }
          var folder = pth.dirname(path);
          self.fs.exists(folder, function(exists) {
            if (!exists) self.makeDir(folder);
            self.fs.open(path, "w", 438, function(err2, fd) {
              if (err2) {
                self.fs.chmod(path, 438, function() {
                  self.fs.open(path, "w", 438, function(err3, fd2) {
                    self.fs.write(fd2, content, 0, content.length, 0, function() {
                      self.fs.close(fd2, function() {
                        self.fs.chmod(path, attr || 438, function() {
                          callback(true);
                        });
                      });
                    });
                  });
                });
              } else if (fd) {
                self.fs.write(fd, content, 0, content.length, 0, function() {
                  self.fs.close(fd, function() {
                    self.fs.chmod(path, attr || 438, function() {
                      callback(true);
                    });
                  });
                });
              } else {
                self.fs.chmod(path, attr || 438, function() {
                  callback(true);
                });
              }
            });
          });
        });
      });
    };
    Utils.prototype.findFiles = function(path) {
      const self = this;
      function findSync(dir, pattern, recursive) {
        if (typeof pattern === "boolean") {
          recursive = pattern;
          pattern = void 0;
        }
        let files = [];
        self.fs.readdirSync(dir).forEach(function(file) {
          const path2 = pth.join(dir, file);
          const stat = self.fs.statSync(path2);
          if (!pattern || pattern.test(path2)) {
            files.push(pth.normalize(path2) + (stat.isDirectory() ? self.sep : ""));
          }
          if (stat.isDirectory() && recursive) files = files.concat(findSync(path2, pattern, recursive));
        });
        return files;
      }
      return findSync(path, void 0, true);
    };
    Utils.prototype.findFilesAsync = function(dir, cb) {
      const self = this;
      let results = [];
      self.fs.readdir(dir, function(err, list) {
        if (err) return cb(err);
        let list_length = list.length;
        if (!list_length) return cb(null, results);
        list.forEach(function(file) {
          file = pth.join(dir, file);
          self.fs.stat(file, function(err2, stat) {
            if (err2) return cb(err2);
            if (stat) {
              results.push(pth.normalize(file) + (stat.isDirectory() ? self.sep : ""));
              if (stat.isDirectory()) {
                self.findFilesAsync(file, function(err3, res) {
                  if (err3) return cb(err3);
                  results = results.concat(res);
                  if (!--list_length) cb(null, results);
                });
              } else {
                if (!--list_length) cb(null, results);
              }
            }
          });
        });
      });
    };
    Utils.prototype.getAttributes = function() {
    };
    Utils.prototype.setAttributes = function() {
    };
    Utils.crc32update = function(crc, byte) {
      return crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
    };
    Utils.crc32 = function(buf) {
      if (typeof buf === "string") {
        buf = Buffer.from(buf, "utf8");
      }
      let len = buf.length;
      let crc = ~0;
      for (let off = 0; off < len; ) crc = Utils.crc32update(crc, buf[off++]);
      return ~crc >>> 0;
    };
    Utils.methodToString = function(method) {
      switch (method) {
        case Constants.STORED:
          return "STORED (" + method + ")";
        case Constants.DEFLATED:
          return "DEFLATED (" + method + ")";
        default:
          return "UNSUPPORTED (" + method + ")";
      }
    };
    Utils.canonical = function(path) {
      if (!path) return "";
      const safeSuffix = pth.posix.normalize("/" + path.split("\\").join("/"));
      return pth.join(".", safeSuffix);
    };
    Utils.zipnamefix = function(path) {
      if (!path) return "";
      const safeSuffix = pth.posix.normalize("/" + path.split("\\").join("/"));
      return pth.posix.join(".", safeSuffix);
    };
    Utils.findLast = function(arr, callback) {
      if (!Array.isArray(arr)) throw new TypeError("arr is not array");
      const len = arr.length >>> 0;
      for (let i = len - 1; i >= 0; i--) {
        if (callback(arr[i], i, arr)) {
          return arr[i];
        }
      }
      return void 0;
    };
    Utils.sanitize = function(prefix, name) {
      prefix = pth.resolve(pth.normalize(prefix));
      var parts = name.split("/");
      for (var i = 0, l = parts.length; i < l; i++) {
        var path = pth.normalize(pth.join(prefix, parts.slice(i, l).join(pth.sep)));
        if (path.indexOf(prefix) === 0) {
          return path;
        }
      }
      return pth.normalize(pth.join(prefix, pth.basename(name)));
    };
    Utils.toBuffer = function toBuffer(input, encoder) {
      if (Buffer.isBuffer(input)) {
        return input;
      } else if (input instanceof Uint8Array) {
        return Buffer.from(input);
      } else {
        return typeof input === "string" ? encoder(input) : Buffer.alloc(0);
      }
    };
    Utils.readBigUInt64LE = function(buffer, index) {
      const lo = buffer.readUInt32LE(index);
      const hi = buffer.readUInt32LE(index + 4);
      return hi * 4294967296 + lo;
    };
    Utils.fromDOS2Date = function(val) {
      return new Date((val >> 25 & 127) + 1980, Math.max((val >> 21 & 15) - 1, 0), Math.max(val >> 16 & 31, 1), val >> 11 & 31, val >> 5 & 63, (val & 31) << 1);
    };
    Utils.fromDate2DOS = function(val) {
      let date = 0;
      let time = 0;
      if (val.getFullYear() > 1979) {
        date = (val.getFullYear() - 1980 & 127) << 9 | val.getMonth() + 1 << 5 | val.getDate();
        time = val.getHours() << 11 | val.getMinutes() << 5 | val.getSeconds() >> 1;
      }
      return date << 16 | time;
    };
    Utils.isWin = isWin;
    Utils.crcTable = crcTable;
  }
});

// node_modules/adm-zip/util/fattr.js
var require_fattr = __commonJS({
  "node_modules/adm-zip/util/fattr.js"(exports2, module2) {
    var pth = require("path");
    module2.exports = function(path, { fs: fs2 }) {
      var _path = path || "", _obj = newAttr(), _stat = null;
      function newAttr() {
        return {
          directory: false,
          readonly: false,
          hidden: false,
          executable: false,
          mtime: 0,
          atime: 0
        };
      }
      if (_path && fs2.existsSync(_path)) {
        _stat = fs2.statSync(_path);
        _obj.directory = _stat.isDirectory();
        _obj.mtime = _stat.mtime;
        _obj.atime = _stat.atime;
        _obj.executable = (73 & _stat.mode) !== 0;
        _obj.readonly = (128 & _stat.mode) === 0;
        _obj.hidden = pth.basename(_path)[0] === ".";
      } else {
        console.warn("Invalid path: " + _path);
      }
      return {
        get directory() {
          return _obj.directory;
        },
        get readOnly() {
          return _obj.readonly;
        },
        get hidden() {
          return _obj.hidden;
        },
        get mtime() {
          return _obj.mtime;
        },
        get atime() {
          return _obj.atime;
        },
        get executable() {
          return _obj.executable;
        },
        decodeAttributes: function() {
        },
        encodeAttributes: function() {
        },
        toJSON: function() {
          return {
            path: _path,
            isDirectory: _obj.directory,
            isReadOnly: _obj.readonly,
            isHidden: _obj.hidden,
            isExecutable: _obj.executable,
            mTime: _obj.mtime,
            aTime: _obj.atime
          };
        },
        toString: function() {
          return JSON.stringify(this.toJSON(), null, "	");
        }
      };
    };
  }
});

// node_modules/adm-zip/util/decoder.js
var require_decoder = __commonJS({
  "node_modules/adm-zip/util/decoder.js"(exports2, module2) {
    module2.exports = {
      efs: true,
      encode: (data) => Buffer.from(data, "utf8"),
      decode: (data) => data.toString("utf8")
    };
  }
});

// node_modules/adm-zip/util/index.js
var require_util = __commonJS({
  "node_modules/adm-zip/util/index.js"(exports2, module2) {
    module2.exports = require_utils();
    module2.exports.Constants = require_constants();
    module2.exports.Errors = require_errors();
    module2.exports.FileAttr = require_fattr();
    module2.exports.decoder = require_decoder();
  }
});

// node_modules/adm-zip/headers/entryHeader.js
var require_entryHeader = __commonJS({
  "node_modules/adm-zip/headers/entryHeader.js"(exports2, module2) {
    var Utils = require_util();
    var Constants = Utils.Constants;
    module2.exports = function() {
      var _verMade = 20, _version = 10, _flags = 0, _method = 0, _time = 0, _crc = 0, _compressedSize = 0, _size = 0, _fnameLen = 0, _extraLen = 0, _comLen = 0, _diskStart = 0, _inattr = 0, _attr = 0, _offset = 0;
      _verMade |= Utils.isWin ? 2560 : 768;
      _flags |= Constants.FLG_EFS;
      const _localHeader = {
        extraLen: 0
      };
      const uint32 = (val) => Math.max(0, val) >>> 0;
      const uint16 = (val) => Math.max(0, val) & 65535;
      const uint8 = (val) => Math.max(0, val) & 255;
      _time = Utils.fromDate2DOS(/* @__PURE__ */ new Date());
      return {
        get made() {
          return _verMade;
        },
        set made(val) {
          _verMade = val;
        },
        get version() {
          return _version;
        },
        set version(val) {
          _version = val;
        },
        get flags() {
          return _flags;
        },
        set flags(val) {
          _flags = val;
        },
        get flags_efs() {
          return (_flags & Constants.FLG_EFS) > 0;
        },
        set flags_efs(val) {
          if (val) {
            _flags |= Constants.FLG_EFS;
          } else {
            _flags &= ~Constants.FLG_EFS;
          }
        },
        get flags_desc() {
          return (_flags & Constants.FLG_DESC) > 0;
        },
        set flags_desc(val) {
          if (val) {
            _flags |= Constants.FLG_DESC;
          } else {
            _flags &= ~Constants.FLG_DESC;
          }
        },
        get method() {
          return _method;
        },
        set method(val) {
          switch (val) {
            case Constants.STORED:
              this.version = 10;
            case Constants.DEFLATED:
            default:
              this.version = 20;
          }
          _method = val;
        },
        get time() {
          return Utils.fromDOS2Date(this.timeval);
        },
        set time(val) {
          val = new Date(val);
          this.timeval = Utils.fromDate2DOS(val);
        },
        get timeval() {
          return _time;
        },
        set timeval(val) {
          _time = uint32(val);
        },
        get timeHighByte() {
          return uint8(_time >>> 8);
        },
        get crc() {
          return _crc;
        },
        set crc(val) {
          _crc = uint32(val);
        },
        get compressedSize() {
          return _compressedSize;
        },
        set compressedSize(val) {
          _compressedSize = uint32(val);
        },
        get size() {
          return _size;
        },
        set size(val) {
          _size = uint32(val);
        },
        get fileNameLength() {
          return _fnameLen;
        },
        set fileNameLength(val) {
          _fnameLen = val;
        },
        get extraLength() {
          return _extraLen;
        },
        set extraLength(val) {
          _extraLen = val;
        },
        get extraLocalLength() {
          return _localHeader.extraLen;
        },
        set extraLocalLength(val) {
          _localHeader.extraLen = val;
        },
        get commentLength() {
          return _comLen;
        },
        set commentLength(val) {
          _comLen = val;
        },
        get diskNumStart() {
          return _diskStart;
        },
        set diskNumStart(val) {
          _diskStart = uint32(val);
        },
        get inAttr() {
          return _inattr;
        },
        set inAttr(val) {
          _inattr = uint32(val);
        },
        get attr() {
          return _attr;
        },
        set attr(val) {
          _attr = uint32(val);
        },
        // get Unix file permissions
        get fileAttr() {
          return (_attr || 0) >> 16 & 4095;
        },
        get offset() {
          return _offset;
        },
        set offset(val) {
          _offset = uint32(val);
        },
        get encrypted() {
          return (_flags & Constants.FLG_ENC) === Constants.FLG_ENC;
        },
        get centralHeaderSize() {
          return Constants.CENHDR + _fnameLen + _extraLen + _comLen;
        },
        get realDataOffset() {
          return _offset + Constants.LOCHDR + _localHeader.fnameLen + _localHeader.extraLen;
        },
        get localHeader() {
          return _localHeader;
        },
        loadLocalHeaderFromBinary: function(input) {
          var data = input.slice(_offset, _offset + Constants.LOCHDR);
          if (data.readUInt32LE(0) !== Constants.LOCSIG) {
            throw Utils.Errors.INVALID_LOC();
          }
          _localHeader.version = data.readUInt16LE(Constants.LOCVER);
          _localHeader.flags = data.readUInt16LE(Constants.LOCFLG);
          _localHeader.flags_desc = (_localHeader.flags & Constants.FLG_DESC) > 0;
          _localHeader.method = data.readUInt16LE(Constants.LOCHOW);
          _localHeader.time = data.readUInt32LE(Constants.LOCTIM);
          _localHeader.crc = data.readUInt32LE(Constants.LOCCRC);
          _localHeader.compressedSize = data.readUInt32LE(Constants.LOCSIZ);
          _localHeader.size = data.readUInt32LE(Constants.LOCLEN);
          _localHeader.fnameLen = data.readUInt16LE(Constants.LOCNAM);
          _localHeader.extraLen = data.readUInt16LE(Constants.LOCEXT);
          const extraStart = _offset + Constants.LOCHDR + _localHeader.fnameLen;
          const extraEnd = extraStart + _localHeader.extraLen;
          return input.slice(extraStart, extraEnd);
        },
        loadFromBinary: function(data) {
          if (data.length !== Constants.CENHDR || data.readUInt32LE(0) !== Constants.CENSIG) {
            throw Utils.Errors.INVALID_CEN();
          }
          _verMade = data.readUInt16LE(Constants.CENVEM);
          _version = data.readUInt16LE(Constants.CENVER);
          _flags = data.readUInt16LE(Constants.CENFLG);
          _method = data.readUInt16LE(Constants.CENHOW);
          _time = data.readUInt32LE(Constants.CENTIM);
          _crc = data.readUInt32LE(Constants.CENCRC);
          _compressedSize = data.readUInt32LE(Constants.CENSIZ);
          _size = data.readUInt32LE(Constants.CENLEN);
          _fnameLen = data.readUInt16LE(Constants.CENNAM);
          _extraLen = data.readUInt16LE(Constants.CENEXT);
          _comLen = data.readUInt16LE(Constants.CENCOM);
          _diskStart = data.readUInt16LE(Constants.CENDSK);
          _inattr = data.readUInt16LE(Constants.CENATT);
          _attr = data.readUInt32LE(Constants.CENATX);
          _offset = data.readUInt32LE(Constants.CENOFF);
        },
        localHeaderToBinary: function() {
          var data = Buffer.alloc(Constants.LOCHDR);
          data.writeUInt32LE(Constants.LOCSIG, 0);
          data.writeUInt16LE(_version, Constants.LOCVER);
          data.writeUInt16LE(_flags, Constants.LOCFLG);
          data.writeUInt16LE(_method, Constants.LOCHOW);
          data.writeUInt32LE(_time, Constants.LOCTIM);
          data.writeUInt32LE(_crc, Constants.LOCCRC);
          data.writeUInt32LE(_compressedSize, Constants.LOCSIZ);
          data.writeUInt32LE(_size, Constants.LOCLEN);
          data.writeUInt16LE(_fnameLen, Constants.LOCNAM);
          data.writeUInt16LE(_localHeader.extraLen, Constants.LOCEXT);
          return data;
        },
        centralHeaderToBinary: function() {
          var data = Buffer.alloc(Constants.CENHDR + _fnameLen + _extraLen + _comLen);
          data.writeUInt32LE(Constants.CENSIG, 0);
          data.writeUInt16LE(_verMade, Constants.CENVEM);
          data.writeUInt16LE(_version, Constants.CENVER);
          data.writeUInt16LE(_flags, Constants.CENFLG);
          data.writeUInt16LE(_method, Constants.CENHOW);
          data.writeUInt32LE(_time, Constants.CENTIM);
          data.writeUInt32LE(_crc, Constants.CENCRC);
          data.writeUInt32LE(_compressedSize, Constants.CENSIZ);
          data.writeUInt32LE(_size, Constants.CENLEN);
          data.writeUInt16LE(_fnameLen, Constants.CENNAM);
          data.writeUInt16LE(_extraLen, Constants.CENEXT);
          data.writeUInt16LE(_comLen, Constants.CENCOM);
          data.writeUInt16LE(_diskStart, Constants.CENDSK);
          data.writeUInt16LE(_inattr, Constants.CENATT);
          data.writeUInt32LE(_attr, Constants.CENATX);
          data.writeUInt32LE(_offset, Constants.CENOFF);
          return data;
        },
        toJSON: function() {
          const bytes = function(nr) {
            return nr + " bytes";
          };
          return {
            made: _verMade,
            version: _version,
            flags: _flags,
            method: Utils.methodToString(_method),
            time: this.time,
            crc: "0x" + _crc.toString(16).toUpperCase(),
            compressedSize: bytes(_compressedSize),
            size: bytes(_size),
            fileNameLength: bytes(_fnameLen),
            extraLength: bytes(_extraLen),
            commentLength: bytes(_comLen),
            diskNumStart: _diskStart,
            inAttr: _inattr,
            attr: _attr,
            offset: _offset,
            centralHeaderSize: bytes(Constants.CENHDR + _fnameLen + _extraLen + _comLen)
          };
        },
        toString: function() {
          return JSON.stringify(this.toJSON(), null, "	");
        }
      };
    };
  }
});

// node_modules/adm-zip/headers/mainHeader.js
var require_mainHeader = __commonJS({
  "node_modules/adm-zip/headers/mainHeader.js"(exports2, module2) {
    var Utils = require_util();
    var Constants = Utils.Constants;
    module2.exports = function() {
      var _volumeEntries = 0, _totalEntries = 0, _size = 0, _offset = 0, _commentLength = 0;
      return {
        get diskEntries() {
          return _volumeEntries;
        },
        set diskEntries(val) {
          _volumeEntries = _totalEntries = val;
        },
        get totalEntries() {
          return _totalEntries;
        },
        set totalEntries(val) {
          _totalEntries = _volumeEntries = val;
        },
        get size() {
          return _size;
        },
        set size(val) {
          _size = val;
        },
        get offset() {
          return _offset;
        },
        set offset(val) {
          _offset = val;
        },
        get commentLength() {
          return _commentLength;
        },
        set commentLength(val) {
          _commentLength = val;
        },
        get mainHeaderSize() {
          return Constants.ENDHDR + _commentLength;
        },
        loadFromBinary: function(data) {
          if ((data.length !== Constants.ENDHDR || data.readUInt32LE(0) !== Constants.ENDSIG) && (data.length < Constants.ZIP64HDR || data.readUInt32LE(0) !== Constants.ZIP64SIG)) {
            throw Utils.Errors.INVALID_END();
          }
          if (data.readUInt32LE(0) === Constants.ENDSIG) {
            _volumeEntries = data.readUInt16LE(Constants.ENDSUB);
            _totalEntries = data.readUInt16LE(Constants.ENDTOT);
            _size = data.readUInt32LE(Constants.ENDSIZ);
            _offset = data.readUInt32LE(Constants.ENDOFF);
            _commentLength = data.readUInt16LE(Constants.ENDCOM);
          } else {
            _volumeEntries = Utils.readBigUInt64LE(data, Constants.ZIP64SUB);
            _totalEntries = Utils.readBigUInt64LE(data, Constants.ZIP64TOT);
            _size = Utils.readBigUInt64LE(data, Constants.ZIP64SIZE);
            _offset = Utils.readBigUInt64LE(data, Constants.ZIP64OFF);
            _commentLength = 0;
          }
        },
        toBinary: function() {
          var b = Buffer.alloc(Constants.ENDHDR + _commentLength);
          b.writeUInt32LE(Constants.ENDSIG, 0);
          b.writeUInt32LE(0, 4);
          b.writeUInt16LE(_volumeEntries, Constants.ENDSUB);
          b.writeUInt16LE(_totalEntries, Constants.ENDTOT);
          b.writeUInt32LE(_size, Constants.ENDSIZ);
          b.writeUInt32LE(_offset, Constants.ENDOFF);
          b.writeUInt16LE(_commentLength, Constants.ENDCOM);
          b.fill(" ", Constants.ENDHDR);
          return b;
        },
        toJSON: function() {
          const offset = function(nr, len) {
            let offs = nr.toString(16).toUpperCase();
            while (offs.length < len) offs = "0" + offs;
            return "0x" + offs;
          };
          return {
            diskEntries: _volumeEntries,
            totalEntries: _totalEntries,
            size: _size + " bytes",
            offset: offset(_offset, 4),
            commentLength: _commentLength
          };
        },
        toString: function() {
          return JSON.stringify(this.toJSON(), null, "	");
        }
      };
    };
  }
});

// node_modules/adm-zip/headers/index.js
var require_headers = __commonJS({
  "node_modules/adm-zip/headers/index.js"(exports2) {
    exports2.EntryHeader = require_entryHeader();
    exports2.MainHeader = require_mainHeader();
  }
});

// node_modules/adm-zip/methods/deflater.js
var require_deflater = __commonJS({
  "node_modules/adm-zip/methods/deflater.js"(exports2, module2) {
    module2.exports = function(inbuf) {
      var zlib = require("zlib");
      var opts = { chunkSize: (parseInt(inbuf.length / 1024) + 1) * 1024 };
      return {
        deflate: function() {
          return zlib.deflateRawSync(inbuf, opts);
        },
        deflateAsync: function(callback) {
          var tmp = zlib.createDeflateRaw(opts), parts = [], total = 0;
          tmp.on("data", function(data) {
            parts.push(data);
            total += data.length;
          });
          tmp.on("end", function() {
            var buf = Buffer.alloc(total), written = 0;
            buf.fill(0);
            for (var i = 0; i < parts.length; i++) {
              var part = parts[i];
              part.copy(buf, written);
              written += part.length;
            }
            callback && callback(buf);
          });
          tmp.end(inbuf);
        }
      };
    };
  }
});

// node_modules/adm-zip/methods/inflater.js
var require_inflater = __commonJS({
  "node_modules/adm-zip/methods/inflater.js"(exports2, module2) {
    var version = +(process.versions ? process.versions.node : "").split(".")[0] || 0;
    module2.exports = function(inbuf, expectedLength) {
      var zlib = require("zlib");
      const option = version >= 15 && expectedLength > 0 ? { maxOutputLength: expectedLength } : {};
      return {
        inflate: function() {
          return zlib.inflateRawSync(inbuf, option);
        },
        inflateAsync: function(callback) {
          var tmp = zlib.createInflateRaw(option), parts = [], total = 0;
          tmp.on("data", function(data) {
            parts.push(data);
            total += data.length;
          });
          tmp.on("end", function() {
            var buf = Buffer.alloc(total), written = 0;
            buf.fill(0);
            for (var i = 0; i < parts.length; i++) {
              var part = parts[i];
              part.copy(buf, written);
              written += part.length;
            }
            callback && callback(buf);
          });
          tmp.end(inbuf);
        }
      };
    };
  }
});

// node_modules/adm-zip/methods/zipcrypto.js
var require_zipcrypto = __commonJS({
  "node_modules/adm-zip/methods/zipcrypto.js"(exports2, module2) {
    "use strict";
    var { randomFillSync } = require("crypto");
    var Errors = require_errors();
    var crctable = new Uint32Array(256).map((t, crc) => {
      for (let j = 0; j < 8; j++) {
        if (0 !== (crc & 1)) {
          crc = crc >>> 1 ^ 3988292384;
        } else {
          crc >>>= 1;
        }
      }
      return crc >>> 0;
    });
    var uMul = (a, b) => Math.imul(a, b) >>> 0;
    var crc32update = (pCrc32, bval) => {
      return crctable[(pCrc32 ^ bval) & 255] ^ pCrc32 >>> 8;
    };
    var genSalt = () => {
      if ("function" === typeof randomFillSync) {
        return randomFillSync(Buffer.alloc(12));
      } else {
        return genSalt.node();
      }
    };
    genSalt.node = () => {
      const salt = Buffer.alloc(12);
      const len = salt.length;
      for (let i = 0; i < len; i++) salt[i] = Math.random() * 256 & 255;
      return salt;
    };
    var config = {
      genSalt
    };
    function Initkeys(pw) {
      const pass = Buffer.isBuffer(pw) ? pw : Buffer.from(pw);
      this.keys = new Uint32Array([305419896, 591751049, 878082192]);
      for (let i = 0; i < pass.length; i++) {
        this.updateKeys(pass[i]);
      }
    }
    Initkeys.prototype.updateKeys = function(byteValue) {
      const keys = this.keys;
      keys[0] = crc32update(keys[0], byteValue);
      keys[1] += keys[0] & 255;
      keys[1] = uMul(keys[1], 134775813) + 1;
      keys[2] = crc32update(keys[2], keys[1] >>> 24);
      return byteValue;
    };
    Initkeys.prototype.next = function() {
      const k = (this.keys[2] | 2) >>> 0;
      return uMul(k, k ^ 1) >> 8 & 255;
    };
    function make_decrypter(pwd) {
      const keys = new Initkeys(pwd);
      return function(data) {
        const result = Buffer.alloc(data.length);
        let pos = 0;
        for (let c of data) {
          result[pos++] = keys.updateKeys(c ^ keys.next());
        }
        return result;
      };
    }
    function make_encrypter(pwd) {
      const keys = new Initkeys(pwd);
      return function(data, result, pos = 0) {
        if (!result) result = Buffer.alloc(data.length);
        for (let c of data) {
          const k = keys.next();
          result[pos++] = c ^ k;
          keys.updateKeys(c);
        }
        return result;
      };
    }
    function decrypt(data, header, pwd) {
      if (!data || !Buffer.isBuffer(data) || data.length < 12) {
        return Buffer.alloc(0);
      }
      const decrypter = make_decrypter(pwd);
      const salt = decrypter(data.slice(0, 12));
      const verifyByte = (header.flags & 8) === 8 ? header.timeHighByte : header.crc >>> 24;
      if (salt[11] !== verifyByte) {
        throw Errors.WRONG_PASSWORD();
      }
      return decrypter(data.slice(12));
    }
    function _salter(data) {
      if (Buffer.isBuffer(data) && data.length >= 12) {
        config.genSalt = function() {
          return data.slice(0, 12);
        };
      } else if (data === "node") {
        config.genSalt = genSalt.node;
      } else {
        config.genSalt = genSalt;
      }
    }
    function encrypt(data, header, pwd, oldlike = false) {
      if (data == null) data = Buffer.alloc(0);
      if (!Buffer.isBuffer(data)) data = Buffer.from(data.toString());
      const encrypter = make_encrypter(pwd);
      const salt = config.genSalt();
      salt[11] = header.crc >>> 24 & 255;
      if (oldlike) salt[10] = header.crc >>> 16 & 255;
      const result = Buffer.alloc(data.length + 12);
      encrypter(salt, result);
      return encrypter(data, result, 12);
    }
    module2.exports = { decrypt, encrypt, _salter };
  }
});

// node_modules/adm-zip/methods/index.js
var require_methods = __commonJS({
  "node_modules/adm-zip/methods/index.js"(exports2) {
    exports2.Deflater = require_deflater();
    exports2.Inflater = require_inflater();
    exports2.ZipCrypto = require_zipcrypto();
  }
});

// node_modules/adm-zip/zipEntry.js
var require_zipEntry = __commonJS({
  "node_modules/adm-zip/zipEntry.js"(exports2, module2) {
    var Utils = require_util();
    var Headers = require_headers();
    var Constants = Utils.Constants;
    var Methods = require_methods();
    module2.exports = function(options, input) {
      var _centralHeader = new Headers.EntryHeader(), _entryName = Buffer.alloc(0), _comment = Buffer.alloc(0), _isDirectory = false, uncompressedData = null, _extra = Buffer.alloc(0), _extralocal = Buffer.alloc(0), _efs = true;
      const opts = options;
      const decoder = typeof opts.decoder === "object" ? opts.decoder : Utils.decoder;
      _efs = decoder.hasOwnProperty("efs") ? decoder.efs : false;
      function getCompressedDataFromZip() {
        if (!input || !(input instanceof Uint8Array)) {
          return Buffer.alloc(0);
        }
        _extralocal = _centralHeader.loadLocalHeaderFromBinary(input);
        return input.slice(_centralHeader.realDataOffset, _centralHeader.realDataOffset + _centralHeader.compressedSize);
      }
      function crc32OK(data) {
        if (!_centralHeader.flags_desc && !_centralHeader.localHeader.flags_desc) {
          if (Utils.crc32(data) !== _centralHeader.localHeader.crc) {
            return false;
          }
        } else {
          const descriptor = {};
          const dataEndOffset = _centralHeader.realDataOffset + _centralHeader.compressedSize;
          if (input.readUInt32LE(dataEndOffset) == Constants.LOCSIG || input.readUInt32LE(dataEndOffset) == Constants.CENSIG) {
            throw Utils.Errors.DESCRIPTOR_NOT_EXIST();
          }
          if (input.readUInt32LE(dataEndOffset) == Constants.EXTSIG) {
            descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC);
            descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ);
            descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN);
          } else if (input.readUInt16LE(dataEndOffset + 12) === 19280) {
            descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC - 4);
            descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ - 4);
            descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN - 4);
          } else {
            throw Utils.Errors.DESCRIPTOR_UNKNOWN();
          }
          if (descriptor.compressedSize !== _centralHeader.compressedSize || descriptor.size !== _centralHeader.size || descriptor.crc !== _centralHeader.crc) {
            throw Utils.Errors.DESCRIPTOR_FAULTY();
          }
          if (Utils.crc32(data) !== descriptor.crc) {
            return false;
          }
        }
        return true;
      }
      function decompress2(async, callback, pass) {
        if (typeof callback === "undefined" && typeof async === "string") {
          pass = async;
          async = void 0;
        }
        if (_isDirectory) {
          if (async && callback) {
            callback(Buffer.alloc(0), Utils.Errors.DIRECTORY_CONTENT_ERROR());
          }
          return Buffer.alloc(0);
        }
        var compressedData = getCompressedDataFromZip();
        if (compressedData.length === 0) {
          if (async && callback) callback(compressedData);
          return compressedData;
        }
        if (_centralHeader.encrypted) {
          if ("string" !== typeof pass && !Buffer.isBuffer(pass)) {
            throw Utils.Errors.INVALID_PASS_PARAM();
          }
          compressedData = Methods.ZipCrypto.decrypt(compressedData, _centralHeader, pass);
        }
        var data = Buffer.alloc(_centralHeader.size);
        switch (_centralHeader.method) {
          case Utils.Constants.STORED:
            compressedData.copy(data);
            if (!crc32OK(data)) {
              if (async && callback) callback(data, Utils.Errors.BAD_CRC());
              throw Utils.Errors.BAD_CRC();
            } else {
              if (async && callback) callback(data);
              return data;
            }
          case Utils.Constants.DEFLATED:
            var inflater = new Methods.Inflater(compressedData, _centralHeader.size);
            if (!async) {
              const result = inflater.inflate(data);
              result.copy(data, 0);
              if (!crc32OK(data)) {
                throw Utils.Errors.BAD_CRC(`"${decoder.decode(_entryName)}"`);
              }
              return data;
            } else {
              inflater.inflateAsync(function(result) {
                result.copy(result, 0);
                if (callback) {
                  if (!crc32OK(result)) {
                    callback(result, Utils.Errors.BAD_CRC());
                  } else {
                    callback(result);
                  }
                }
              });
            }
            break;
          default:
            if (async && callback) callback(Buffer.alloc(0), Utils.Errors.UNKNOWN_METHOD());
            throw Utils.Errors.UNKNOWN_METHOD();
        }
      }
      function compress(async, callback) {
        if ((!uncompressedData || !uncompressedData.length) && Buffer.isBuffer(input)) {
          if (async && callback) callback(getCompressedDataFromZip());
          return getCompressedDataFromZip();
        }
        if (uncompressedData.length && !_isDirectory) {
          var compressedData;
          switch (_centralHeader.method) {
            case Utils.Constants.STORED:
              _centralHeader.compressedSize = _centralHeader.size;
              compressedData = Buffer.alloc(uncompressedData.length);
              uncompressedData.copy(compressedData);
              if (async && callback) callback(compressedData);
              return compressedData;
            default:
            case Utils.Constants.DEFLATED:
              var deflater = new Methods.Deflater(uncompressedData);
              if (!async) {
                var deflated = deflater.deflate();
                _centralHeader.compressedSize = deflated.length;
                return deflated;
              } else {
                deflater.deflateAsync(function(data) {
                  compressedData = Buffer.alloc(data.length);
                  _centralHeader.compressedSize = data.length;
                  data.copy(compressedData);
                  callback && callback(compressedData);
                });
              }
              deflater = null;
              break;
          }
        } else if (async && callback) {
          callback(Buffer.alloc(0));
        } else {
          return Buffer.alloc(0);
        }
      }
      function readUInt64LE(buffer, offset) {
        return Utils.readBigUInt64LE(buffer, offset);
      }
      function parseExtra(data) {
        try {
          var offset = 0;
          var signature, size, part;
          while (offset + 4 < data.length) {
            signature = data.readUInt16LE(offset);
            offset += 2;
            size = data.readUInt16LE(offset);
            offset += 2;
            part = data.slice(offset, offset + size);
            offset += size;
            if (Constants.ID_ZIP64 === signature) {
              parseZip64ExtendedInformation(part);
            }
          }
        } catch (error) {
          throw Utils.Errors.EXTRA_FIELD_PARSE_ERROR();
        }
      }
      function parseZip64ExtendedInformation(data) {
        var size, compressedSize, offset, diskNumStart;
        if (data.length >= Constants.EF_ZIP64_SCOMP) {
          size = readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
          if (_centralHeader.size === Constants.EF_ZIP64_OR_32) {
            _centralHeader.size = size;
          }
        }
        if (data.length >= Constants.EF_ZIP64_RHO) {
          compressedSize = readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
          if (_centralHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
            _centralHeader.compressedSize = compressedSize;
          }
        }
        if (data.length >= Constants.EF_ZIP64_DSN) {
          offset = readUInt64LE(data, Constants.EF_ZIP64_RHO);
          if (_centralHeader.offset === Constants.EF_ZIP64_OR_32) {
            _centralHeader.offset = offset;
          }
        }
        if (data.length >= Constants.EF_ZIP64_DSN + 4) {
          diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
          if (_centralHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
            _centralHeader.diskNumStart = diskNumStart;
          }
        }
      }
      return {
        get entryName() {
          return decoder.decode(_entryName);
        },
        get rawEntryName() {
          return _entryName;
        },
        set entryName(val) {
          _entryName = Utils.toBuffer(val, decoder.encode);
          var lastChar = _entryName[_entryName.length - 1];
          _isDirectory = lastChar === 47 || lastChar === 92;
          _centralHeader.fileNameLength = _entryName.length;
        },
        get efs() {
          if (typeof _efs === "function") {
            return _efs(this.entryName);
          } else {
            return _efs;
          }
        },
        get extra() {
          return _extra;
        },
        set extra(val) {
          _extra = val;
          _centralHeader.extraLength = val.length;
          parseExtra(val);
        },
        get comment() {
          return decoder.decode(_comment);
        },
        set comment(val) {
          _comment = Utils.toBuffer(val, decoder.encode);
          _centralHeader.commentLength = _comment.length;
          if (_comment.length > 65535) throw Utils.Errors.COMMENT_TOO_LONG();
        },
        get name() {
          var n = decoder.decode(_entryName);
          return _isDirectory ? n.substr(n.length - 1).split("/").pop() : n.split("/").pop();
        },
        get isDirectory() {
          return _isDirectory;
        },
        getCompressedData: function() {
          return compress(false, null);
        },
        getCompressedDataAsync: function(callback) {
          compress(true, callback);
        },
        setData: function(value2) {
          uncompressedData = Utils.toBuffer(value2, Utils.decoder.encode);
          if (!_isDirectory && uncompressedData.length) {
            _centralHeader.size = uncompressedData.length;
            _centralHeader.method = Utils.Constants.DEFLATED;
            _centralHeader.crc = Utils.crc32(value2);
            _centralHeader.changed = true;
          } else {
            _centralHeader.method = Utils.Constants.STORED;
          }
        },
        getData: function(pass) {
          if (_centralHeader.changed) {
            return uncompressedData;
          } else {
            return decompress2(false, null, pass);
          }
        },
        getDataAsync: function(callback, pass) {
          if (_centralHeader.changed) {
            callback(uncompressedData);
          } else {
            decompress2(true, callback, pass);
          }
        },
        set attr(attr) {
          _centralHeader.attr = attr;
        },
        get attr() {
          return _centralHeader.attr;
        },
        set header(data) {
          _centralHeader.loadFromBinary(data);
        },
        get header() {
          return _centralHeader;
        },
        packCentralHeader: function() {
          _centralHeader.flags_efs = this.efs;
          _centralHeader.extraLength = _extra.length;
          var header = _centralHeader.centralHeaderToBinary();
          var addpos = Utils.Constants.CENHDR;
          _entryName.copy(header, addpos);
          addpos += _entryName.length;
          _extra.copy(header, addpos);
          addpos += _centralHeader.extraLength;
          _comment.copy(header, addpos);
          return header;
        },
        packLocalHeader: function() {
          let addpos = 0;
          _centralHeader.flags_efs = this.efs;
          _centralHeader.extraLocalLength = _extralocal.length;
          const localHeaderBuf = _centralHeader.localHeaderToBinary();
          const localHeader = Buffer.alloc(localHeaderBuf.length + _entryName.length + _centralHeader.extraLocalLength);
          localHeaderBuf.copy(localHeader, addpos);
          addpos += localHeaderBuf.length;
          _entryName.copy(localHeader, addpos);
          addpos += _entryName.length;
          _extralocal.copy(localHeader, addpos);
          addpos += _extralocal.length;
          return localHeader;
        },
        toJSON: function() {
          const bytes = function(nr) {
            return "<" + (nr && nr.length + " bytes buffer" || "null") + ">";
          };
          return {
            entryName: this.entryName,
            name: this.name,
            comment: this.comment,
            isDirectory: this.isDirectory,
            header: _centralHeader.toJSON(),
            compressedData: bytes(input),
            data: bytes(uncompressedData)
          };
        },
        toString: function() {
          return JSON.stringify(this.toJSON(), null, "	");
        }
      };
    };
  }
});

// node_modules/adm-zip/zipFile.js
var require_zipFile = __commonJS({
  "node_modules/adm-zip/zipFile.js"(exports2, module2) {
    var ZipEntry = require_zipEntry();
    var Headers = require_headers();
    var Utils = require_util();
    module2.exports = function(inBuffer, options) {
      var entryList = [], entryTable = {}, _comment = Buffer.alloc(0), mainHeader = new Headers.MainHeader(), loadedEntries = false;
      var password = null;
      const temporary = /* @__PURE__ */ new Set();
      const opts = options;
      const { noSort, decoder } = opts;
      if (inBuffer) {
        readMainHeader(opts.readEntries);
      } else {
        loadedEntries = true;
      }
      function makeTemporaryFolders() {
        const foldersList = /* @__PURE__ */ new Set();
        for (const elem of Object.keys(entryTable)) {
          const elements = elem.split("/");
          elements.pop();
          if (!elements.length) continue;
          for (let i = 0; i < elements.length; i++) {
            const sub = elements.slice(0, i + 1).join("/") + "/";
            foldersList.add(sub);
          }
        }
        for (const elem of foldersList) {
          if (!(elem in entryTable)) {
            const tempfolder = new ZipEntry(opts);
            tempfolder.entryName = elem;
            tempfolder.attr = 16;
            tempfolder.temporary = true;
            entryList.push(tempfolder);
            entryTable[tempfolder.entryName] = tempfolder;
            temporary.add(tempfolder);
          }
        }
      }
      function readEntries() {
        loadedEntries = true;
        entryTable = {};
        if (mainHeader.diskEntries > (inBuffer.length - mainHeader.offset) / Utils.Constants.CENHDR) {
          throw Utils.Errors.DISK_ENTRY_TOO_LARGE();
        }
        entryList = new Array(mainHeader.diskEntries);
        var index = mainHeader.offset;
        for (var i = 0; i < entryList.length; i++) {
          var tmp = index, entry = new ZipEntry(opts, inBuffer);
          entry.header = inBuffer.slice(tmp, tmp += Utils.Constants.CENHDR);
          entry.entryName = inBuffer.slice(tmp, tmp += entry.header.fileNameLength);
          if (entry.header.extraLength) {
            entry.extra = inBuffer.slice(tmp, tmp += entry.header.extraLength);
          }
          if (entry.header.commentLength) entry.comment = inBuffer.slice(tmp, tmp + entry.header.commentLength);
          index += entry.header.centralHeaderSize;
          entryList[i] = entry;
          entryTable[entry.entryName] = entry;
        }
        temporary.clear();
        makeTemporaryFolders();
      }
      function readMainHeader(readNow) {
        var i = inBuffer.length - Utils.Constants.ENDHDR, max = Math.max(0, i - 65535), n = max, endStart = inBuffer.length, endOffset = -1, commentEnd = 0;
        const trailingSpace = typeof opts.trailingSpace === "boolean" ? opts.trailingSpace : false;
        if (trailingSpace) max = 0;
        for (i; i >= n; i--) {
          if (inBuffer[i] !== 80) continue;
          if (inBuffer.readUInt32LE(i) === Utils.Constants.ENDSIG) {
            endOffset = i;
            commentEnd = i;
            endStart = i + Utils.Constants.ENDHDR;
            n = i - Utils.Constants.END64HDR;
            continue;
          }
          if (inBuffer.readUInt32LE(i) === Utils.Constants.END64SIG) {
            n = max;
            continue;
          }
          if (inBuffer.readUInt32LE(i) === Utils.Constants.ZIP64SIG) {
            endOffset = i;
            endStart = i + Utils.readBigUInt64LE(inBuffer, i + Utils.Constants.ZIP64SIZE) + Utils.Constants.ZIP64LEAD;
            break;
          }
        }
        if (endOffset == -1) throw Utils.Errors.INVALID_FORMAT();
        mainHeader.loadFromBinary(inBuffer.slice(endOffset, endStart));
        if (mainHeader.commentLength) {
          _comment = inBuffer.slice(commentEnd + Utils.Constants.ENDHDR);
        }
        if (readNow) readEntries();
      }
      function sortEntries() {
        if (entryList.length > 1 && !noSort) {
          entryList.sort((a, b) => a.entryName.toLowerCase().localeCompare(b.entryName.toLowerCase()));
        }
      }
      return {
        /**
         * Returns an array of ZipEntry objects existent in the current opened archive
         * @return Array
         */
        get entries() {
          if (!loadedEntries) {
            readEntries();
          }
          return entryList.filter((e) => !temporary.has(e));
        },
        /**
         * Archive comment
         * @return {String}
         */
        get comment() {
          return decoder.decode(_comment);
        },
        set comment(val) {
          _comment = Utils.toBuffer(val, decoder.encode);
          mainHeader.commentLength = _comment.length;
        },
        getEntryCount: function() {
          if (!loadedEntries) {
            return mainHeader.diskEntries;
          }
          return entryList.length;
        },
        forEach: function(callback) {
          this.entries.forEach(callback);
        },
        /**
         * Returns a reference to the entry with the given name or null if entry is inexistent
         *
         * @param entryName
         * @return ZipEntry
         */
        getEntry: function(entryName) {
          if (!loadedEntries) {
            readEntries();
          }
          return entryTable[entryName] || null;
        },
        /**
         * Adds the given entry to the entry list
         *
         * @param entry
         */
        setEntry: function(entry) {
          if (!loadedEntries) {
            readEntries();
          }
          entryList.push(entry);
          entryTable[entry.entryName] = entry;
          mainHeader.totalEntries = entryList.length;
        },
        /**
         * Removes the file with the given name from the entry list.
         *
         * If the entry is a directory, then all nested files and directories will be removed
         * @param entryName
         * @returns {void}
         */
        deleteFile: function(entryName, withsubfolders = true) {
          if (!loadedEntries) {
            readEntries();
          }
          const entry = entryTable[entryName];
          const list = this.getEntryChildren(entry, withsubfolders).map((child) => child.entryName);
          list.forEach(this.deleteEntry);
        },
        /**
         * Removes the entry with the given name from the entry list.
         *
         * @param {string} entryName
         * @returns {void}
         */
        deleteEntry: function(entryName) {
          if (!loadedEntries) {
            readEntries();
          }
          const entry = entryTable[entryName];
          const index = entryList.indexOf(entry);
          if (index >= 0) {
            entryList.splice(index, 1);
            delete entryTable[entryName];
            mainHeader.totalEntries = entryList.length;
          }
        },
        /**
         *  Iterates and returns all nested files and directories of the given entry
         *
         * @param entry
         * @return Array
         */
        getEntryChildren: function(entry, subfolders = true) {
          if (!loadedEntries) {
            readEntries();
          }
          if (typeof entry === "object") {
            if (entry.isDirectory && subfolders) {
              const list = [];
              const name = entry.entryName;
              for (const zipEntry of entryList) {
                if (zipEntry.entryName.startsWith(name)) {
                  list.push(zipEntry);
                }
              }
              return list;
            } else {
              return [entry];
            }
          }
          return [];
        },
        /**
         *  How many child elements entry has
         *
         * @param {ZipEntry} entry
         * @return {integer}
         */
        getChildCount: function(entry) {
          if (entry && entry.isDirectory) {
            const list = this.getEntryChildren(entry);
            return list.includes(entry) ? list.length - 1 : list.length;
          }
          return 0;
        },
        /**
         * Returns the zip file
         *
         * @return Buffer
         */
        compressToBuffer: function() {
          if (!loadedEntries) {
            readEntries();
          }
          sortEntries();
          const dataBlock = [];
          const headerBlocks = [];
          let totalSize = 0;
          let dindex = 0;
          mainHeader.size = 0;
          mainHeader.offset = 0;
          let totalEntries = 0;
          for (const entry of this.entries) {
            const compressedData = entry.getCompressedData();
            entry.header.offset = dindex;
            const localHeader = entry.packLocalHeader();
            const dataLength = localHeader.length + compressedData.length;
            dindex += dataLength;
            dataBlock.push(localHeader);
            dataBlock.push(compressedData);
            const centralHeader = entry.packCentralHeader();
            headerBlocks.push(centralHeader);
            mainHeader.size += centralHeader.length;
            totalSize += dataLength + centralHeader.length;
            totalEntries++;
          }
          totalSize += mainHeader.mainHeaderSize;
          mainHeader.offset = dindex;
          mainHeader.totalEntries = totalEntries;
          dindex = 0;
          const outBuffer = Buffer.alloc(totalSize);
          for (const content of dataBlock) {
            content.copy(outBuffer, dindex);
            dindex += content.length;
          }
          for (const content of headerBlocks) {
            content.copy(outBuffer, dindex);
            dindex += content.length;
          }
          const mh = mainHeader.toBinary();
          if (_comment) {
            _comment.copy(mh, Utils.Constants.ENDHDR);
          }
          mh.copy(outBuffer, dindex);
          inBuffer = outBuffer;
          loadedEntries = false;
          return outBuffer;
        },
        toAsyncBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
          try {
            if (!loadedEntries) {
              readEntries();
            }
            sortEntries();
            const dataBlock = [];
            const centralHeaders = [];
            let totalSize = 0;
            let dindex = 0;
            let totalEntries = 0;
            mainHeader.size = 0;
            mainHeader.offset = 0;
            const compress2Buffer = function(entryLists) {
              if (entryLists.length > 0) {
                const entry = entryLists.shift();
                const name = entry.entryName + entry.extra.toString();
                if (onItemStart) onItemStart(name);
                entry.getCompressedDataAsync(function(compressedData) {
                  if (onItemEnd) onItemEnd(name);
                  entry.header.offset = dindex;
                  const localHeader = entry.packLocalHeader();
                  const dataLength = localHeader.length + compressedData.length;
                  dindex += dataLength;
                  dataBlock.push(localHeader);
                  dataBlock.push(compressedData);
                  const centalHeader = entry.packCentralHeader();
                  centralHeaders.push(centalHeader);
                  mainHeader.size += centalHeader.length;
                  totalSize += dataLength + centalHeader.length;
                  totalEntries++;
                  compress2Buffer(entryLists);
                });
              } else {
                totalSize += mainHeader.mainHeaderSize;
                mainHeader.offset = dindex;
                mainHeader.totalEntries = totalEntries;
                dindex = 0;
                const outBuffer = Buffer.alloc(totalSize);
                dataBlock.forEach(function(content) {
                  content.copy(outBuffer, dindex);
                  dindex += content.length;
                });
                centralHeaders.forEach(function(content) {
                  content.copy(outBuffer, dindex);
                  dindex += content.length;
                });
                const mh = mainHeader.toBinary();
                if (_comment) {
                  _comment.copy(mh, Utils.Constants.ENDHDR);
                }
                mh.copy(outBuffer, dindex);
                inBuffer = outBuffer;
                loadedEntries = false;
                onSuccess(outBuffer);
              }
            };
            compress2Buffer(Array.from(this.entries));
          } catch (e) {
            onFail(e);
          }
        }
      };
    };
  }
});

// node_modules/adm-zip/adm-zip.js
var require_adm_zip = __commonJS({
  "node_modules/adm-zip/adm-zip.js"(exports2, module2) {
    var Utils = require_util();
    var pth = require("path");
    var ZipEntry = require_zipEntry();
    var ZipFile = require_zipFile();
    var get_Bool = (...val) => Utils.findLast(val, (c) => typeof c === "boolean");
    var get_Str = (...val) => Utils.findLast(val, (c) => typeof c === "string");
    var get_Fun = (...val) => Utils.findLast(val, (c) => typeof c === "function");
    var defaultOptions = {
      // option "noSort" : if true it disables files sorting
      noSort: false,
      // read entries during load (initial loading may be slower)
      readEntries: false,
      // default method is none
      method: Utils.Constants.NONE,
      // file system
      fs: null
    };
    module2.exports = function(input, options) {
      let inBuffer = null;
      const opts = Object.assign(/* @__PURE__ */ Object.create(null), defaultOptions);
      if (input && "object" === typeof input) {
        if (!(input instanceof Uint8Array)) {
          Object.assign(opts, input);
          input = opts.input ? opts.input : void 0;
          if (opts.input) delete opts.input;
        }
        if (Buffer.isBuffer(input)) {
          inBuffer = input;
          opts.method = Utils.Constants.BUFFER;
          input = void 0;
        }
      }
      Object.assign(opts, options);
      const filetools = new Utils(opts);
      if (typeof opts.decoder !== "object" || typeof opts.decoder.encode !== "function" || typeof opts.decoder.decode !== "function") {
        opts.decoder = Utils.decoder;
      }
      if (input && "string" === typeof input) {
        if (filetools.fs.existsSync(input)) {
          opts.method = Utils.Constants.FILE;
          opts.filename = input;
          inBuffer = filetools.fs.readFileSync(input);
        } else {
          throw Utils.Errors.INVALID_FILENAME();
        }
      }
      const _zip = new ZipFile(inBuffer, opts);
      const { canonical, sanitize, zipnamefix } = Utils;
      function getEntry(entry) {
        if (entry && _zip) {
          var item;
          if (typeof entry === "string") item = _zip.getEntry(pth.posix.normalize(entry));
          if (typeof entry === "object" && typeof entry.entryName !== "undefined" && typeof entry.header !== "undefined") item = _zip.getEntry(entry.entryName);
          if (item) {
            return item;
          }
        }
        return null;
      }
      function fixPath(zipPath) {
        const { join, normalize, sep } = pth.posix;
        return join(pth.isAbsolute(zipPath) ? "/" : ".", normalize(sep + zipPath.split("\\").join(sep) + sep));
      }
      function filenameFilter(filterfn) {
        if (filterfn instanceof RegExp) {
          return /* @__PURE__ */ (function(rx) {
            return function(filename) {
              return rx.test(filename);
            };
          })(filterfn);
        } else if ("function" !== typeof filterfn) {
          return () => true;
        }
        return filterfn;
      }
      const relativePath = (local, entry) => {
        let lastChar = entry.slice(-1);
        lastChar = lastChar === filetools.sep ? filetools.sep : "";
        return pth.relative(local, entry) + lastChar;
      };
      return {
        /**
         * Extracts the given entry from the archive and returns the content as a Buffer object
         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
         * @param {Buffer|string} [pass] - password
         * @return Buffer or Null in case of error
         */
        readFile: function(entry, pass) {
          var item = getEntry(entry);
          return item && item.getData(pass) || null;
        },
        /**
         * Returns how many child elements has on entry (directories) on files it is always 0
         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
         * @returns {integer}
         */
        childCount: function(entry) {
          const item = getEntry(entry);
          if (item) {
            return _zip.getChildCount(item);
          }
        },
        /**
         * Asynchronous readFile
         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
         * @param {callback} callback
         *
         * @return Buffer or Null in case of error
         */
        readFileAsync: function(entry, callback) {
          var item = getEntry(entry);
          if (item) {
            item.getDataAsync(callback);
          } else {
            callback(null, "getEntry failed for:" + entry);
          }
        },
        /**
         * Extracts the given entry from the archive and returns the content as plain text in the given encoding
         * @param {ZipEntry|string} entry - ZipEntry object or String with the full path of the entry
         * @param {string} encoding - Optional. If no encoding is specified utf8 is used
         *
         * @return String
         */
        readAsText: function(entry, encoding) {
          var item = getEntry(entry);
          if (item) {
            var data = item.getData();
            if (data && data.length) {
              return data.toString(encoding || "utf8");
            }
          }
          return "";
        },
        /**
         * Asynchronous readAsText
         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
         * @param {callback} callback
         * @param {string} [encoding] - Optional. If no encoding is specified utf8 is used
         *
         * @return String
         */
        readAsTextAsync: function(entry, callback, encoding) {
          var item = getEntry(entry);
          if (item) {
            item.getDataAsync(function(data, err) {
              if (err) {
                callback(data, err);
                return;
              }
              if (data && data.length) {
                callback(data.toString(encoding || "utf8"));
              } else {
                callback("");
              }
            });
          } else {
            callback("");
          }
        },
        /**
         * Remove the entry from the file or the entry and all it's nested directories and files if the given entry is a directory
         *
         * @param {ZipEntry|string} entry
         * @returns {void}
         */
        deleteFile: function(entry, withsubfolders = true) {
          var item = getEntry(entry);
          if (item) {
            _zip.deleteFile(item.entryName, withsubfolders);
          }
        },
        /**
         * Remove the entry from the file or directory without affecting any nested entries
         *
         * @param {ZipEntry|string} entry
         * @returns {void}
         */
        deleteEntry: function(entry) {
          var item = getEntry(entry);
          if (item) {
            _zip.deleteEntry(item.entryName);
          }
        },
        /**
         * Adds a comment to the zip. The zip must be rewritten after adding the comment.
         *
         * @param {string} comment
         */
        addZipComment: function(comment) {
          _zip.comment = comment;
        },
        /**
         * Returns the zip comment
         *
         * @return String
         */
        getZipComment: function() {
          return _zip.comment || "";
        },
        /**
         * Adds a comment to a specified zipEntry. The zip must be rewritten after adding the comment
         * The comment cannot exceed 65535 characters in length
         *
         * @param {ZipEntry} entry
         * @param {string} comment
         */
        addZipEntryComment: function(entry, comment) {
          var item = getEntry(entry);
          if (item) {
            item.comment = comment;
          }
        },
        /**
         * Returns the comment of the specified entry
         *
         * @param {ZipEntry} entry
         * @return String
         */
        getZipEntryComment: function(entry) {
          var item = getEntry(entry);
          if (item) {
            return item.comment || "";
          }
          return "";
        },
        /**
         * Updates the content of an existing entry inside the archive. The zip must be rewritten after updating the content
         *
         * @param {ZipEntry} entry
         * @param {Buffer} content
         */
        updateFile: function(entry, content) {
          var item = getEntry(entry);
          if (item) {
            item.setData(content);
          }
        },
        /**
         * Adds a file from the disk to the archive
         *
         * @param {string} localPath File to add to zip
         * @param {string} [zipPath] Optional path inside the zip
         * @param {string} [zipName] Optional name for the file
         * @param {string} [comment] Optional file comment
         */
        addLocalFile: function(localPath2, zipPath, zipName, comment) {
          if (filetools.fs.existsSync(localPath2)) {
            zipPath = zipPath ? fixPath(zipPath) : "";
            const p = pth.win32.basename(pth.win32.normalize(localPath2));
            zipPath += zipName ? zipName : p;
            const _attr = filetools.fs.statSync(localPath2);
            const data = _attr.isFile() ? filetools.fs.readFileSync(localPath2) : Buffer.alloc(0);
            if (_attr.isDirectory()) zipPath += filetools.sep;
            this.addFile(zipPath, data, comment, _attr);
          } else {
            throw Utils.Errors.FILE_NOT_FOUND(localPath2);
          }
        },
        /**
         * Callback for showing if everything was done.
         *
         * @callback doneCallback
         * @param {Error} err - Error object
         * @param {boolean} done - was request fully completed
         */
        /**
         * Adds a file from the disk to the archive
         *
         * @param {(object|string)} options - options object, if it is string it us used as localPath.
         * @param {string} options.localPath - Local path to the file.
         * @param {string} [options.comment] - Optional file comment.
         * @param {string} [options.zipPath] - Optional path inside the zip
         * @param {string} [options.zipName] - Optional name for the file
         * @param {doneCallback} callback - The callback that handles the response.
         */
        addLocalFileAsync: function(options2, callback) {
          options2 = typeof options2 === "object" ? options2 : { localPath: options2 };
          const localPath2 = pth.resolve(options2.localPath);
          const { comment } = options2;
          let { zipPath, zipName } = options2;
          const self = this;
          filetools.fs.stat(localPath2, function(err, stats) {
            if (err) return callback(err, false);
            zipPath = zipPath ? fixPath(zipPath) : "";
            const p = pth.win32.basename(pth.win32.normalize(localPath2));
            zipPath += zipName ? zipName : p;
            if (stats.isFile()) {
              filetools.fs.readFile(localPath2, function(err2, data) {
                if (err2) return callback(err2, false);
                self.addFile(zipPath, data, comment, stats);
                return setImmediate(callback, void 0, true);
              });
            } else if (stats.isDirectory()) {
              zipPath += filetools.sep;
              self.addFile(zipPath, Buffer.alloc(0), comment, stats);
              return setImmediate(callback, void 0, true);
            }
          });
        },
        /**
         * Adds a local directory and all its nested files and directories to the archive
         *
         * @param {string} localPath - local path to the folder
         * @param {string} [zipPath] - optional path inside zip
         * @param {(RegExp|function)} [filter] - optional RegExp or Function if files match will be included.
         */
        addLocalFolder: function(localPath2, zipPath, filter) {
          filter = filenameFilter(filter);
          zipPath = zipPath ? fixPath(zipPath) : "";
          localPath2 = pth.normalize(localPath2);
          if (filetools.fs.existsSync(localPath2)) {
            const items = filetools.findFiles(localPath2);
            const self = this;
            if (items.length) {
              for (const filepath of items) {
                const p = pth.join(zipPath, relativePath(localPath2, filepath));
                if (filter(p)) {
                  self.addLocalFile(filepath, pth.dirname(p));
                }
              }
            }
          } else {
            throw Utils.Errors.FILE_NOT_FOUND(localPath2);
          }
        },
        /**
         * Asynchronous addLocalFolder
         * @param {string} localPath
         * @param {callback} callback
         * @param {string} [zipPath] optional path inside zip
         * @param {RegExp|function} [filter] optional RegExp or Function if files match will
         *               be included.
         */
        addLocalFolderAsync: function(localPath2, callback, zipPath, filter) {
          filter = filenameFilter(filter);
          zipPath = zipPath ? fixPath(zipPath) : "";
          localPath2 = pth.normalize(localPath2);
          var self = this;
          filetools.fs.open(localPath2, "r", function(err) {
            if (err && err.code === "ENOENT") {
              callback(void 0, Utils.Errors.FILE_NOT_FOUND(localPath2));
            } else if (err) {
              callback(void 0, err);
            } else {
              var items = filetools.findFiles(localPath2);
              var i = -1;
              var next = function() {
                i += 1;
                if (i < items.length) {
                  var filepath = items[i];
                  var p = relativePath(localPath2, filepath).split("\\").join("/");
                  p = p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
                  if (filter(p)) {
                    filetools.fs.stat(filepath, function(er0, stats) {
                      if (er0) callback(void 0, er0);
                      if (stats.isFile()) {
                        filetools.fs.readFile(filepath, function(er1, data) {
                          if (er1) {
                            callback(void 0, er1);
                          } else {
                            self.addFile(zipPath + p, data, "", stats);
                            next();
                          }
                        });
                      } else {
                        self.addFile(zipPath + p + "/", Buffer.alloc(0), "", stats);
                        next();
                      }
                    });
                  } else {
                    process.nextTick(() => {
                      next();
                    });
                  }
                } else {
                  callback(true, void 0);
                }
              };
              next();
            }
          });
        },
        /**
         * Adds a local directory and all its nested files and directories to the archive
         *
         * @param {object | string} options - options object, if it is string it us used as localPath.
         * @param {string} options.localPath - Local path to the folder.
         * @param {string} [options.zipPath] - optional path inside zip.
         * @param {RegExp|function} [options.filter] - optional RegExp or Function if files match will be included.
         * @param {function|string} [options.namefix] - optional function to help fix filename
         * @param {doneCallback} callback - The callback that handles the response.
         *
         */
        addLocalFolderAsync2: function(options2, callback) {
          const self = this;
          options2 = typeof options2 === "object" ? options2 : { localPath: options2 };
          localPath = pth.resolve(fixPath(options2.localPath));
          let { zipPath, filter, namefix } = options2;
          if (filter instanceof RegExp) {
            filter = /* @__PURE__ */ (function(rx) {
              return function(filename) {
                return rx.test(filename);
              };
            })(filter);
          } else if ("function" !== typeof filter) {
            filter = function() {
              return true;
            };
          }
          zipPath = zipPath ? fixPath(zipPath) : "";
          if (namefix == "latin1") {
            namefix = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
          }
          if (typeof namefix !== "function") namefix = (str) => str;
          const relPathFix = (entry) => pth.join(zipPath, namefix(relativePath(localPath, entry)));
          const fileNameFix = (entry) => pth.win32.basename(pth.win32.normalize(namefix(entry)));
          filetools.fs.open(localPath, "r", function(err) {
            if (err && err.code === "ENOENT") {
              callback(void 0, Utils.Errors.FILE_NOT_FOUND(localPath));
            } else if (err) {
              callback(void 0, err);
            } else {
              filetools.findFilesAsync(localPath, function(err2, fileEntries) {
                if (err2) return callback(err2);
                fileEntries = fileEntries.filter((dir) => filter(relPathFix(dir)));
                if (!fileEntries.length) callback(void 0, false);
                setImmediate(
                  fileEntries.reverse().reduce(function(next, entry) {
                    return function(err3, done) {
                      if (err3 || done === false) return setImmediate(next, err3, false);
                      self.addLocalFileAsync(
                        {
                          localPath: entry,
                          zipPath: pth.dirname(relPathFix(entry)),
                          zipName: fileNameFix(entry)
                        },
                        next
                      );
                    };
                  }, callback)
                );
              });
            }
          });
        },
        /**
         * Adds a local directory and all its nested files and directories to the archive
         *
         * @param {string} localPath - path where files will be extracted
         * @param {object} props - optional properties
         * @param {string} [props.zipPath] - optional path inside zip
         * @param {RegExp|function} [props.filter] - optional RegExp or Function if files match will be included.
         * @param {function|string} [props.namefix] - optional function to help fix filename
         */
        addLocalFolderPromise: function(localPath2, props) {
          return new Promise((resolve, reject) => {
            this.addLocalFolderAsync2(Object.assign({ localPath: localPath2 }, props), (err, done) => {
              if (err) reject(err);
              if (done) resolve(this);
            });
          });
        },
        /**
         * Allows you to create a entry (file or directory) in the zip file.
         * If you want to create a directory the entryName must end in / and a null buffer should be provided.
         * Comment and attributes are optional
         *
         * @param {string} entryName
         * @param {Buffer | string} content - file content as buffer or utf8 coded string
         * @param {string} [comment] - file comment
         * @param {number | object} [attr] - number as unix file permissions, object as filesystem Stats object
         */
        addFile: function(entryName, content, comment, attr) {
          entryName = zipnamefix(entryName);
          let entry = getEntry(entryName);
          const update = entry != null;
          if (!update) {
            entry = new ZipEntry(opts);
            entry.entryName = entryName;
          }
          entry.comment = comment || "";
          const isStat = "object" === typeof attr && attr instanceof filetools.fs.Stats;
          if (isStat) {
            entry.header.time = attr.mtime;
          }
          var fileattr = entry.isDirectory ? 16 : 0;
          let unix = entry.isDirectory ? 16384 : 32768;
          if (isStat) {
            unix |= 4095 & attr.mode;
          } else if ("number" === typeof attr) {
            unix |= 4095 & attr;
          } else {
            unix |= entry.isDirectory ? 493 : 420;
          }
          fileattr = (fileattr | unix << 16) >>> 0;
          entry.attr = fileattr;
          entry.setData(content);
          if (!update) _zip.setEntry(entry);
          return entry;
        },
        /**
         * Returns an array of ZipEntry objects representing the files and folders inside the archive
         *
         * @param {string} [password]
         * @returns Array
         */
        getEntries: function(password) {
          _zip.password = password;
          return _zip ? _zip.entries : [];
        },
        /**
         * Returns a ZipEntry object representing the file or folder specified by ``name``.
         *
         * @param {string} name
         * @return ZipEntry
         */
        getEntry: function(name) {
          return getEntry(name);
        },
        getEntryCount: function() {
          return _zip.getEntryCount();
        },
        forEach: function(callback) {
          return _zip.forEach(callback);
        },
        /**
         * Extracts the given entry to the given targetPath
         * If the entry is a directory inside the archive, the entire directory and it's subdirectories will be extracted
         *
         * @param {string|ZipEntry} entry - ZipEntry object or String with the full path of the entry
         * @param {string} targetPath - Target folder where to write the file
         * @param {boolean} [maintainEntryPath=true] - If maintainEntryPath is true and the entry is inside a folder, the entry folder will be created in targetPath as well. Default is TRUE
         * @param {boolean} [overwrite=false] - If the file already exists at the target path, the file will be overwriten if this is true.
         * @param {boolean} [keepOriginalPermission=false] - The file will be set as the permission from the entry if this is true.
         * @param {string} [outFileName] - String If set will override the filename of the extracted file (Only works if the entry is a file)
         *
         * @return Boolean
         */
        extractEntryTo: function(entry, targetPath, maintainEntryPath, overwrite, keepOriginalPermission, outFileName) {
          overwrite = get_Bool(false, overwrite);
          keepOriginalPermission = get_Bool(false, keepOriginalPermission);
          maintainEntryPath = get_Bool(true, maintainEntryPath);
          outFileName = get_Str(keepOriginalPermission, outFileName);
          var item = getEntry(entry);
          if (!item) {
            throw Utils.Errors.NO_ENTRY();
          }
          var entryName = canonical(item.entryName);
          var target = sanitize(targetPath, outFileName && !item.isDirectory ? outFileName : maintainEntryPath ? entryName : pth.basename(entryName));
          if (item.isDirectory) {
            var children = _zip.getEntryChildren(item);
            children.forEach(function(child) {
              if (child.isDirectory) return;
              var content2 = child.getData();
              if (!content2) {
                throw Utils.Errors.CANT_EXTRACT_FILE();
              }
              var name = canonical(child.entryName);
              var childName = sanitize(targetPath, maintainEntryPath ? name : pth.basename(name));
              const fileAttr2 = keepOriginalPermission ? child.header.fileAttr : void 0;
              filetools.writeFileTo(childName, content2, overwrite, fileAttr2);
            });
            return true;
          }
          var content = item.getData(_zip.password);
          if (!content) throw Utils.Errors.CANT_EXTRACT_FILE();
          if (filetools.fs.existsSync(target) && !overwrite) {
            throw Utils.Errors.CANT_OVERRIDE();
          }
          const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
          filetools.writeFileTo(target, content, overwrite, fileAttr);
          return true;
        },
        /**
         * Test the archive
         * @param {string} [pass]
         */
        test: function(pass) {
          if (!_zip) {
            return false;
          }
          for (var entry in _zip.entries) {
            try {
              if (entry.isDirectory) {
                continue;
              }
              var content = _zip.entries[entry].getData(pass);
              if (!content) {
                return false;
              }
            } catch (err) {
              return false;
            }
          }
          return true;
        },
        /**
         * Extracts the entire archive to the given location
         *
         * @param {string} targetPath Target location
         * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
         *                  Default is FALSE
         * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
         *                  Default is FALSE
         * @param {string|Buffer} [pass] password
         */
        extractAllTo: function(targetPath, overwrite, keepOriginalPermission, pass) {
          keepOriginalPermission = get_Bool(false, keepOriginalPermission);
          pass = get_Str(keepOriginalPermission, pass);
          overwrite = get_Bool(false, overwrite);
          if (!_zip) throw Utils.Errors.NO_ZIP();
          _zip.entries.forEach(function(entry) {
            var entryName = sanitize(targetPath, canonical(entry.entryName));
            if (entry.isDirectory) {
              filetools.makeDir(entryName);
              return;
            }
            var content = entry.getData(pass);
            if (!content) {
              throw Utils.Errors.CANT_EXTRACT_FILE();
            }
            const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
            filetools.writeFileTo(entryName, content, overwrite, fileAttr);
            try {
              filetools.fs.utimesSync(entryName, entry.header.time, entry.header.time);
            } catch (err) {
              throw Utils.Errors.CANT_EXTRACT_FILE();
            }
          });
        },
        /**
         * Asynchronous extractAllTo
         *
         * @param {string} targetPath Target location
         * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
         *                  Default is FALSE
         * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
         *                  Default is FALSE
         * @param {function} callback The callback will be executed when all entries are extracted successfully or any error is thrown.
         */
        extractAllToAsync: function(targetPath, overwrite, keepOriginalPermission, callback) {
          callback = get_Fun(overwrite, keepOriginalPermission, callback);
          keepOriginalPermission = get_Bool(false, keepOriginalPermission);
          overwrite = get_Bool(false, overwrite);
          if (!callback) {
            return new Promise((resolve, reject) => {
              this.extractAllToAsync(targetPath, overwrite, keepOriginalPermission, function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve(this);
                }
              });
            });
          }
          if (!_zip) {
            callback(Utils.Errors.NO_ZIP());
            return;
          }
          targetPath = pth.resolve(targetPath);
          const getPath = (entry) => sanitize(targetPath, pth.normalize(canonical(entry.entryName)));
          const getError = (msg, file) => new Error(msg + ': "' + file + '"');
          const dirEntries = [];
          const fileEntries = [];
          _zip.entries.forEach((e) => {
            if (e.isDirectory) {
              dirEntries.push(e);
            } else {
              fileEntries.push(e);
            }
          });
          for (const entry of dirEntries) {
            const dirPath = getPath(entry);
            const dirAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
            try {
              filetools.makeDir(dirPath);
              if (dirAttr) filetools.fs.chmodSync(dirPath, dirAttr);
              filetools.fs.utimesSync(dirPath, entry.header.time, entry.header.time);
            } catch (er) {
              callback(getError("Unable to create folder", dirPath));
            }
          }
          fileEntries.reverse().reduce(function(next, entry) {
            return function(err) {
              if (err) {
                next(err);
              } else {
                const entryName = pth.normalize(canonical(entry.entryName));
                const filePath = sanitize(targetPath, entryName);
                entry.getDataAsync(function(content, err_1) {
                  if (err_1) {
                    next(err_1);
                  } else if (!content) {
                    next(Utils.Errors.CANT_EXTRACT_FILE());
                  } else {
                    const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
                    filetools.writeFileToAsync(filePath, content, overwrite, fileAttr, function(succ) {
                      if (!succ) {
                        next(getError("Unable to write file", filePath));
                      }
                      filetools.fs.utimes(filePath, entry.header.time, entry.header.time, function(err_2) {
                        if (err_2) {
                          next(getError("Unable to set times", filePath));
                        } else {
                          next();
                        }
                      });
                    });
                  }
                });
              }
            };
          }, callback)();
        },
        /**
         * Writes the newly created zip file to disk at the specified location or if a zip was opened and no ``targetFileName`` is provided, it will overwrite the opened zip
         *
         * @param {string} targetFileName
         * @param {function} callback
         */
        writeZip: function(targetFileName, callback) {
          if (arguments.length === 1) {
            if (typeof targetFileName === "function") {
              callback = targetFileName;
              targetFileName = "";
            }
          }
          if (!targetFileName && opts.filename) {
            targetFileName = opts.filename;
          }
          if (!targetFileName) return;
          var zipData = _zip.compressToBuffer();
          if (zipData) {
            var ok = filetools.writeFileTo(targetFileName, zipData, true);
            if (typeof callback === "function") callback(!ok ? new Error("failed") : null, "");
          }
        },
        /**
                 *
                 * @param {string} targetFileName
                 * @param {object} [props]
                 * @param {boolean} [props.overwrite=true] If the file already exists at the target path, the file will be overwriten if this is true.
                 * @param {boolean} [props.perm] The file will be set as the permission from the entry if this is true.

                 * @returns {Promise<void>}
                 */
        writeZipPromise: function(targetFileName, props) {
          const { overwrite, perm } = Object.assign({ overwrite: true }, props);
          return new Promise((resolve, reject) => {
            if (!targetFileName && opts.filename) targetFileName = opts.filename;
            if (!targetFileName) reject("ADM-ZIP: ZIP File Name Missing");
            this.toBufferPromise().then((zipData) => {
              const ret = (done) => done ? resolve(done) : reject("ADM-ZIP: Wasn't able to write zip file");
              filetools.writeFileToAsync(targetFileName, zipData, overwrite, perm, ret);
            }, reject);
          });
        },
        /**
         * @returns {Promise<Buffer>} A promise to the Buffer.
         */
        toBufferPromise: function() {
          return new Promise((resolve, reject) => {
            _zip.toAsyncBuffer(resolve, reject);
          });
        },
        /**
         * Returns the content of the entire zip file as a Buffer object
         *
         * @prop {function} [onSuccess]
         * @prop {function} [onFail]
         * @prop {function} [onItemStart]
         * @prop {function} [onItemEnd]
         * @returns {Buffer}
         */
        toBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
          if (typeof onSuccess === "function") {
            _zip.toAsyncBuffer(onSuccess, onFail, onItemStart, onItemEnd);
            return null;
          }
          return _zip.compressToBuffer();
        }
      };
    };
  }
});

// src/server/dataExport/worker.ts
var import_node_worker_threads = require("node:worker_threads");

// src/server/dataExport/engine.ts
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_fs = require("node:fs");
var import_node_crypto = require("node:crypto");
var import_node_zlib = require("node:zlib");
var import_node_util = require("node:util");
var import_adm_zip = __toESM(require_adm_zip(), 1);

// src/server/cells/cellProjection.ts
var CELL_FRESH_MS = 12e4;
function cellId(row, i) {
  return `A${row.array}-S${row.string}-B${Math.floor(i / row.groupsPerBpc) + 1}-C${i % row.groupsPerBpc + 1}`;
}
function freshCell(time, now) {
  return time !== null && time <= now + 5e3 && time >= now - CELL_FRESH_MS;
}

// src/server/dataExport/model.ts
var exportLimits = { days: 7, selections: 2048, series: 65536, rows: 5e6, readBytes: 2 * 1024 ** 3, outputBytes: 512 * 1024 ** 2, zipBytes: 256 * 1024 ** 2, ms: 6e5 };
var hvacMetrics = [
  ...["space", "supply", "control", "outside", "cell", "cooling", "heating"].map((id) => ({ id, label: { space: "Enclosure temperature", supply: "Supply-air temperature", control: "Control temperature", outside: "Outside temperature", cell: "Average cell temperature", cooling: "Cooling setpoint", heating: "Heating setpoint" }[id], unit: "\xB0C" })),
  { id: "current", label: "Whole-unit supply current", unit: "A" },
  { id: "rpm", label: "Fan speed", unit: "RPM" },
  { id: "humidity", label: "Humidity", unit: "%" },
  ...["compressor", "electricHeat", "reversingValve", "fanLow", "fanHigh"].map((id) => ({ id: "command." + id, label: { compressor: "Compressor command", electricHeat: "Electric heat command", reversingValve: "Reversing valve command", fanLow: "Low fan command", fanHigh: "High fan command" }[id], unit: "0/1" }))
];
var cellMetrics = [{ id: "millivolts", label: "Cell voltage", unit: "mV" }, { id: "temperatureF", label: "Cell temperature", unit: "\xB0F" }, ...["currentA", "socPct", "connected", "inRotation", "positiveContactorClosed", "negativeContactorClosed", "balancing"].map((id) => ({ id: "operating." + id, label: { currentA: "String current", socPct: "String SOC", connected: "String connected", inRotation: "In rotation", positiveContactorClosed: "Positive contactor closed", negativeContactorClosed: "Negative contactor closed", balancing: "Balancing state" }[id], unit: id === "currentA" ? "A" : id === "socPct" ? "%" : id === "balancing" ? "" : "0/1" }))];

// src/server/dataExport/engine.ts
var decompress = (0, import_node_util.promisify)(import_node_zlib.gunzip);
var finite = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
var value = (v) => typeof v === "boolean" ? Number(v) : typeof v === "string" ? v.slice(0, 256) : finite(v);
var hash = (v) => (0, import_node_crypto.createHash)("sha256").update(v).digest("hex");
var iso = (v) => v === null ? "" : new Date(v).toISOString();
function csvCell(v) {
  let text = v === null || v === void 0 ? "" : String(v);
  if (typeof v === "string" && /^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
var csv = (rows) => "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
var htmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function coverage(s, from, to) {
  const times = [...new Set(s.points.filter((p) => p[3] === "live" && p[2] !== null && p[1] !== null && p[1] >= from && p[1] <= to).map((p) => p[1]))].sort((a, b) => a - b);
  let gap = times.length ? Math.max(times[0] - from, to - times[times.length - 1]) : to - from, short = null, long = null;
  for (let i = 1; i < times.length; i++) {
    const step = times[i] - times[i - 1];
    short = short === null ? step : Math.min(short, step);
    long = long === null ? step : Math.max(long, step);
    gap = Math.max(gap, step);
  }
  return { id: s.id, label: s.label, metric: s.metric, unit: s.unit, rows: s.points.length, valid: times.length, first: times[0] ?? null, last: times.at(-1) ?? null, largestGapMs: gap, shortestStepMs: short, longestStepMs: long };
}
function graph(s, from, to) {
  const buckets = /* @__PURE__ */ new Map();
  let low = Infinity, high = -Infinity;
  for (const p of s.points) {
    if (p[3] !== "live" || typeof p[2] !== "number" || p[1] === null || p[1] < from || p[1] > to) continue;
    low = Math.min(low, p[2]);
    high = Math.max(high, p[2]);
    const b = Math.min(239, Math.floor((p[1] - from) / (to - from) * 240)), prev = buckets.get(b);
    buckets.set(b, { min: Math.min(prev?.min ?? p[2], p[2]), max: Math.max(prev?.max ?? p[2], p[2]), count: (prev?.count ?? 0) + 1 });
  }
  if (!buckets.size) return "<p>No live numeric samples in this window. See CSV for states and data quality.</p>";
  const span = high - low || 1, y = (n) => 160 - (n - low) / span * 140;
  return `<p>${htmlEscape(low)}\u2013${htmlEscape(high)} ${htmlEscape(s.unit)}</p><svg role="img" aria-label="Recorded range per time bucket" viewBox="0 0 1000 190"><path stroke="#b5bfc8" d="M20 170H980"/>${[...buckets].map(([b, v]) => {
    const x = 20 + b * 4;
    return `<path stroke="#06795c" stroke-width="3" d="M${x} ${y(v.min).toFixed(2)}V${y(v.max).toFixed(2)}"/><circle fill="#06795c" cx="${x}" cy="${y(v.max).toFixed(2)}" r="1.5"><title>${htmlEscape(iso(from + b * (to - from) / 240))}: ${v.min}\u2013${v.max}; ${v.count} samples</title></circle>`;
  }).join("")}</svg>`;
}
function latestSpatialSvg(items, title) {
  const samples = items.map((s) => {
    const point = [...s.points].reverse().find((p) => p[3] === "live" && typeof p[2] === "number");
    return point ? { label: s.label, metric: s.metric, unit: s.unit, value: point[2], at: point[0] } : null;
  }).filter(Boolean);
  if (!samples.length) return `<svg viewBox="0 0 1000 220" role="img" aria-label="${htmlEscape(title)}"><text x="500" y="110" text-anchor="middle">No live numeric samples</text></svg>`;
  const values = samples.map((s) => s.value), low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const x = (i) => 55 + i * 910 / Math.max(1, samples.length - 1), y = (v) => 180 - (v - low) / span * 140;
  return `<svg viewBox="0 0 1000 220" role="img" aria-label="${htmlEscape(title)}"><rect width="1000" height="220" fill="#fff"/><path d="M55 20V180H965" fill="none" stroke="#9baca5"/><text x="60" y="18">${htmlEscape(high)}</text><text x="60" y="176">${htmlEscape(low)}</text>${samples.map((s, i) => `<circle cx="${x(i).toFixed(2)}" cy="${y(s.value).toFixed(2)}" r="2.2" fill="${engineeringColors[i % engineeringColors.length]}"><title>${htmlEscape(s.label)} · ${htmlEscape(s.metric)}: ${htmlEscape(s.value)} ${htmlEscape(s.unit)} · ${htmlEscape(iso(s.at))}</title></circle>`).join("")}</svg>`;
}
function offlineFamilyPage(title, items, from, to) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of items) { const key = engineeringFamily(item) + "|" + item.unit; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
  const sections = [...groups].map(([key, rows]) => `<section><h2>${htmlEscape(key.split("|")[0])} <small>(${htmlEscape(rows[0].unit)})</small></h2>${latestSpatialSvg(rows, key)}<details><summary>${rows.length} retained series</summary><table><thead><tr><th>Equipment</th><th>Measurement</th><th>Rows</th><th>Latest observation UTC</th><th>Latest value</th></tr></thead><tbody>${rows.map((s) => { const point = [...s.points].reverse().find((p) => p[3] === "live" && p[2] !== null); return `<tr><td>${htmlEscape(s.label)}</td><td>${htmlEscape(s.metric)}</td><td>${s.points.length}</td><td>${htmlEscape(iso(point?.[0]) || "Not available")}</td><td>${htmlEscape(point?.[2] ?? "")} ${htmlEscape(s.unit)}</td></tr>`; }).join("")}</tbody></table></details></section>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><title>${htmlEscape(title)}</title><style>body{font:15px system-ui;color:#14312b;max-width:1320px;margin:28px auto;padding:0 18px}a{color:#087253}section{border:1px solid #c6d7d0;border-radius:8px;padding:16px;margin:18px 0}svg{width:100%;max-height:360px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:7px;border-bottom:1px solid #dbe5e1}details{max-height:520px;overflow:auto}small{color:#526760}</style><p><a href="../index.html">← Engineering package index</a></p><h1>${htmlEscape(title)}</h1><p>${htmlEscape(iso(from))} — ${htmlEscape(iso(to))} · UTC · missing values remain blank</p>${sections || "<p>No retained series in this report.</p>"}</html>`;
}
var engineeringColors = ["#2878bd", "#ef6c35", "#22a77a", "#8d62ba", "#d6a11d", "#d34f73", "#4b9ca6", "#7b7f35", "#666f8f"];
var activeCellSnapshots = [];
function engineeringFamily(s) {
  const metric = s.metric.toLowerCase(), unit = s.unit.toLowerCase();
  const array = /\bArray\s+(\d+)\b/i.exec(s.label)?.[1];
  if (metric.includes("reactive") || unit.includes("kvar")) return "Reactive power";
  if (metric.includes("real power") || metric.includes("real-power") || unit === "kw" && (metric.includes("command") || metric.includes("setpoint"))) return "Real power: command, setting, and actual";
  if (metric.includes("dc voltage")) return "PCS DC voltage";
  if (metric.includes("dc current")) return "PCS DC current";
  if (metric.includes("humidity")) return "Humidity";
  if (metric.includes("cell temperature")) return `${array ? `Array ${array} · ` : ""}Cell temperature`;
  if (metric.includes("temperature")) return "Temperature";
  if (metric.includes("cell voltage")) return `${array ? `Array ${array} · ` : ""}Cell voltage`;
  if (metric.includes("string current")) return "String current";
  if (metric.includes("string soc")) return "String SOC";
  return s.metric;
}
function engineeringFamilyGraph(items, from, to) {
  let low = Infinity, high = -Infinity;
  const traces = items.map((s) => ({s, points: s.points.filter((p) => {
    if (p[3] !== "live" || typeof p[2] !== "number" || p[0] === null || p[0] < from || p[0] > to) return false;
    low = Math.min(low, p[2]); high = Math.max(high, p[2]); return true;
  }).map((p) => [p[0], p[2], p[2]])}));
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "<p>No live numeric samples in this family. See CSV for states and quality.</p>";
  const payload = traces.map(({s,points},index) => ({
    label: `${s.label} · ${s.metric}`,
    color: engineeringColors[index % engineeringColors.length],
    points
  }));
  const json = JSON.stringify({from,to,low,high,unit:items[0]?.unit ?? "",traces:payload}).replace(/</g,"\\u003c");
  const legend = payload.map((trace,index) => `<button type="button" class="plot-legend-item" data-trace="${index}" aria-pressed="true"><i style="background:${trace.color}"></i>${htmlEscape(trace.label)}</button>`).join("");
  const legendBlock = payload.length > 24 ? `<details><summary>Choose visible traces (${payload.length})</summary><div class="plot-legend">${legend}</div></details>` : `<div class="plot-legend">${legend}</div>`;
  return `<div class="engineering-plot" data-title="${htmlEscape(engineeringFamily(items[0]))}"><div class="plot-toolbar"><span>Scroll to zoom · drag to pan · hover for exact recorded values</span><button type="button" class="plot-reset">Reset view</button></div>${legendBlock}<div class="plot-stage"><canvas role="img" aria-label="Interactive ${htmlEscape(engineeringFamily(items[0]))} engineering graph"></canvas><div class="plot-tooltip" hidden></div></div><script type="application/json" class="plot-data">${json}</script></div>`;
}
function engineeringFamilySections(all, from, to) {
  const families = /* @__PURE__ */ new Map();
  for (const item of all) { const key = engineeringFamily(item) + "|" + item.unit; if (!families.has(key)) families.set(key, []); families.get(key).push(item); }
  const timelineSeries = all.map((item) => ({
    label: item.label,
    metric: item.metric,
    unit: item.unit,
    points: item.points.filter((point) => Number.isFinite(point[0]) && point[0] >= from && point[0] <= to)
      .map((point) => [point[0], point[1], point[2], point[3], point[4] ?? item.source]).sort((a, b) => a[0] - b[0])
  }));
  const timelineTimes = [...new Set(timelineSeries.flatMap((item) => item.points.map((point) => point[0])))].sort((a, b) => a - b);
  const exactTimelineJson = JSON.stringify({times: timelineTimes, series: timelineSeries}).replace(/</g, "\\u003c");
  const entries = [...families];
  const cards = entries.map(([key, items], index) => `<a href="#graph-${index + 1}" style="display:flex;min-height:170px;flex-direction:column;justify-content:flex-end;border:1px solid #c6d7d0;border-radius:7px;padding:10px;background:linear-gradient(150deg,#f8fbfa,#e9f5f0);color:#087253;text-decoration:none"><span style="height:100px;overflow:hidden">${latestSpatialSvg(items, key)}</span><strong>${htmlEscape(key.split("|")[0])}</strong><span style="font-size:12px;color:#526760;margin-top:6px">${htmlEscape(items[0].unit || "state")} · ${items.length} series</span></a>`).join("");
  const index = `<section id="report-index" class="report-index"><h2>Reports</h2><nav style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px"><a href="#timeline-inspector">Point-in-time inspector</a><a href="#engineering-graphs">Engineering graphs</a><a href="#evidence-library">Individual series evidence</a></nav><h3>Graph gallery</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">${cards}</div></section>`;
  const sections = entries.map(([key, items], position) => `<section class="engineering-family" id="graph-${position + 1}"><a style="float:right;color:#087253;text-decoration:none;font-size:12px" href="#report-index">↑ Reports</a><h2>${htmlEscape(key.split("|")[0])} <small>(${htmlEscape(items[0].unit)})</small></h2>${engineeringFamilyGraph(items, from, to)}<p><small>${items.length} coordinated series · every retained live reading in the selected window · no interpolation</small></p></section>`).join("");
  const organizeEvidence = `<script>addEventListener('DOMContentLoaded',function(){
    const exact=${exactTimelineJson},inspector=document.querySelector('.time-inspector');
    if(inspector){
      inspector.id='timeline-inspector';
      const old=document.getElementById('timeline'),slider=old.cloneNode(true),time=document.getElementById('timeline-time'),body=document.getElementById('timeline-values');
      old.replaceWith(slider);slider.min='0';slider.max=String(Math.max(0,exact.times.length-1));slider.step='1';slider.value=slider.max;
      slider.setAttribute('aria-label','Historian observation timestamp');
      const scale=document.createElement('div');scale.style.cssText='display:grid;grid-template-columns:1fr auto 1fr;gap:12px;font-size:12px;color:#526760';
      scale.innerHTML='<span id="timeline-start"></span><strong id="timeline-position"></strong><span id="timeline-end" style="text-align:right"></span>';slider.after(scale);
      const header=body.closest('table').querySelector('thead tr');header.lastElementChild.textContent='Historian observation time';const sourceHeader=document.createElement('th');sourceHeader.textContent='Source time';header.append(sourceHeader);
      const stamp=function(value){return Number.isFinite(value)?new Date(value).toISOString():'Not supplied'};
      document.getElementById('timeline-start').textContent=exact.times.length?'Start: '+stamp(exact.times[0]):'No historian timestamps';
      document.getElementById('timeline-end').textContent=exact.times.length?'End: '+stamp(exact.times.at(-1)):'';
      const render=function(){
        if(!exact.times.length){time.textContent='No historian observation timestamps';body.innerHTML='<tr><td colspan="6">No selected measurements were recorded in this window.</td></tr>';return}
        const index=Number(slider.value),selectedAt=exact.times[index];time.textContent='Historian observation time: '+stamp(selectedAt);document.getElementById('timeline-position').textContent='Timestamp '+(index+1).toLocaleString()+' of '+exact.times.length.toLocaleString();
        const rows=[];for(const series of exact.series){let low=0,high=series.points.length-1,found=null;while(low<=high){const middle=(low+high)>>1,point=series.points[middle];if(point[0]<=selectedAt){found=point;low=middle+1}else high=middle-1}if(found)rows.push('<tr><td>'+esc(series.label)+'</td><td>'+esc(series.metric)+'</td><td>'+esc(found[2])+' '+esc(series.unit)+'</td><td>'+esc(found[3])+'</td><td>'+esc(stamp(found[0]))+'</td><td>'+esc(stamp(found[1]))+'</td></tr>')}
        body.innerHTML=rows.join('')||'<tr><td colspan="6">No selected measurements were recorded at or before this historian timestamp.</td></tr>';
      };slider.addEventListener('input',render);render();
    }
    const rows=[...document.querySelectorAll('details.series')],heading=[...document.querySelectorAll('h2')].find(function(node){return node.textContent.startsWith('Individual series evidence')});if(!rows.length||!heading)return;const label=heading.nextElementSibling,library=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');library.id='evidence-library';library.style.cssText='background:white;padding:16px;margin:12px 0;border:1px solid #c6d7d0;border-radius:8px';summary.textContent='Individual series evidence ('+rows.length+')';summary.style.cssText='cursor:pointer;font-weight:650';body.style.marginTop='16px';library.append(summary,body);if(label&&label.tagName==='LABEL')body.append(label);for(const row of rows)body.append(row);heading.replaceWith(library)
  })</script>`;
  return `${activeCellSnapshots.length ? cellSpatialExplorer(activeCellSnapshots) : ""}<div id="engineering-graphs">${index}${sections}</div>${organizeEvidence}${activeCellSnapshots.length ? cellSpatialScript() : ""}`;
}
function engineeringFamilyIndex(all) {
  const families = /* @__PURE__ */ new Map();
  for (const item of all) { const key = engineeringFamily(item) + "|" + item.unit; if (!families.has(key)) families.set(key, []); families.get(key).push(item); }
  return [...families].map(([key, items], index) => `<a class="graph-card" href="#graph-${index + 1}"><strong>${htmlEscape(key.split("|")[0])}</strong><span>${htmlEscape(items[0].unit || "state")} · ${items.length} series</span></a>`).join("");
}
function cellSnapshotSvg(records, metric, title) {
  const values = records.map((r) => metric === "voltage" ? r[4] : r[5]).filter(Number.isFinite);
  if (!values.length) return `<svg viewBox="0 0 1000 240" role="img" aria-label="${htmlEscape(title)}"><text x="500" y="120" text-anchor="middle">No recorded ${htmlEscape(metric)} values</text></svg>`;
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  return `<svg viewBox="0 0 1000 240" role="img" aria-label="${htmlEscape(title)}"><rect width="1000" height="240" fill="#fff"/><path d="M55 20V195H975" fill="none" stroke="#9baca5"/><text x="58" y="18">${high.toFixed(1)}</text><text x="58" y="191">${low.toFixed(1)}</text>${records.map((r, i) => { const value = metric === "voltage" ? r[4] : r[5]; if (!Number.isFinite(value)) return ""; const x = 60 + i * 905 / Math.max(1, records.length - 1), y = 190 - (value - low) / span * 165, color = engineeringColors[(r[1] - 1) % engineeringColors.length]; return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.35" fill="${color}"><title>String ${r[1]} · BPC ${r[2]} · Cell ${r[3]}: ${value}</title></circle>`; }).join("")}</svg>`;
}
function cellSpatialExplorer(frames, onlyArray) {
  const payload = frames.map((frame) => ({ at: frame.at, arrays: Object.fromEntries([...frame.arrays].filter(([array]) => !onlyArray || array === onlyArray)) }));
  const json = JSON.stringify(payload).replace(/</g, "\\u003c"), id = `cell-replay-${onlyArray || "all"}`;
  return `<section class="cell-spatial" id="${id}"><h2>${onlyArray ? `Array ${onlyArray} granular cells` : "Granular cell replay"}</h2><p>Actual retained historian frames. Move the timestamp selector to compare every recorded cell without converting each cell into a permanent time-series trace.</p>${onlyArray ? "" : `<label>Array <select class="cell-array">${Array.from({length:8},(_,i)=>`<option value="${i+1}">Array ${i+1}</option>`).join("")}</select></label>`}<input class="cell-time" type="range" min="0" max="${Math.max(0,payload.length-1)}" value="${Math.max(0,payload.length-1)}" step="1" aria-label="Cell historian timestamp"><p><strong class="cell-time-label"></strong></p><div class="cell-chart"></div><div class="scroll"><table><thead><tr><th>String</th><th>BPC</th><th>Cell</th><th>Voltage (mV)</th><th>Temperature (°F)</th><th>Source time UTC</th><th>Quality</th></tr></thead><tbody class="cell-values"></tbody></table></div><script type="application/json" class="cell-data">${json}</script></section>`;
}
function cellSpatialScript() {
  return `<script>function initCellSpatial(){for(const root of document.querySelectorAll('.cell-spatial')){const frames=JSON.parse(root.querySelector('.cell-data').textContent),slider=root.querySelector('.cell-time'),arraySelect=root.querySelector('.cell-array'),label=root.querySelector('.cell-time-label'),chart=root.querySelector('.cell-chart'),body=root.querySelector('.cell-values');function escCell(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}function render(){if(!frames.length){label.textContent='No retained cell frames';chart.innerHTML='';body.innerHTML='<tr><td colspan="7">No granular cell frame was retained in this window.</td></tr>';return}const frame=frames[Number(slider.value)],array=Number(arraySelect?.value||Object.keys(frame.arrays)[0]),rows=frame.arrays[array]||[];label.textContent=new Date(frame.at).toISOString()+' · Array '+array+' · '+rows.length.toLocaleString()+' cells';const vals=rows.map(r=>r[4]).filter(Number.isFinite),low=Math.min(...vals),high=Math.max(...vals),span=high-low||1;chart.innerHTML='<svg viewBox="0 0 1000 250" role="img" aria-label="Cell voltages at selected historian timestamp"><path d="M55 20V205H975" fill="none" stroke="#9baca5"/><text x="58" y="18">'+escCell(Number.isFinite(high)?high.toFixed(1):'')+'</text><text x="58" y="201">'+escCell(Number.isFinite(low)?low.toFixed(1):'')+'</text>'+rows.map((r,i)=>{if(!Number.isFinite(r[4]))return'';const x=60+i*905/Math.max(1,rows.length-1),y=200-(r[4]-low)/span*175,color=['#2878bd','#ef6c35','#22a77a','#8d62ba','#d6a11d','#d34f73','#4b9ca6','#7b7f35','#666f8f'][(r[1]-1)%9];return'<circle cx="'+x.toFixed(2)+'" cy="'+y.toFixed(2)+'" r="1.5" fill="'+color+'"><title>String '+r[1]+' · BPC '+r[2]+' · Cell '+r[3]+': '+r[4]+' mV</title></circle>'}).join('')+'</svg>';body.innerHTML=rows.map(r=>'<tr><td>'+r[1]+'</td><td>'+r[2]+'</td><td>'+r[3]+'</td><td>'+escCell(r[4])+'</td><td>'+escCell(r[5])+'</td><td>'+escCell(Number.isFinite(r[6])?new Date(r[6]).toISOString():'')+'</td><td>'+escCell(r[7])+'</td></tr>').join('')}slider.addEventListener('input',render);arraySelect?.addEventListener('change',render);render()}}initCellSpatial();</script>`;
}
async function buildExport(job) {
  const started = performance.now(), series = /* @__PURE__ */ new Map();
  const cellSnapshotBuckets = /* @__PURE__ */ new Map(), rawCellFiles = [];
  let rows = 0, bytes = 0, outputEstimate = 0, skipped = 0;
  const warnings = [
    ...new Set(job.plans.flatMap((p) => p.notes)),
    "Window boundaries use recorded observation time. Source timestamps are retained separately; clocks are not resampled or aligned.",
    "Missing/stale/ignored readings remain labelled. Blank CSV values mean missing, not zero. Valid counts are distinct live source timestamps within the selected window.",
    "Engineering overview graphs include every retained live numeric reading in the selected window, with no interpolation. CSV contains every retained selected observation, including quality states. Largest gap includes window edges and is not a proven equipment outage."
  ];
  const check = () => {
    if (performance.now() - started > exportLimits.ms) throw Error("Export time limit reached. Select fewer measurements or a shorter window.");
  };
  const add = (id, label, metric, unit, source, gapMs, point) => {
    check();
    let s = series.get(id);
    if (!s) {
      if (series.size >= exportLimits.series) throw Error("Too many data series. Narrow the array, cell, or equipment selection.");
      s = { id, label, metric, unit, source, gapMs, points: [] };
      series.set(id, s);
    }
    if (++rows > exportLimits.rows) throw Error("Export exceeds 5,000,000 readings. Select fewer measurements or a shorter window.");
    outputEstimate += JSON.stringify(point).length + id.length + label.length + metric.length + 120;
    if (outputEstimate > exportLimits.outputBytes) throw Error("Export size limit reached. Narrow the selection.");
    s.source = source;
    point[4] = source;
    s.points.push(point);
  };
  for (const plan of job.plans) for (const select of job.request.selections.filter((s) => s.source === plan.source)) {
    const target = plan.targets.find((t) => t.id === select.target);
    for (const m of target.metrics.filter((m2) => select.metrics.includes(m2.id))) {
      if (plan.source === "cells" && !m.id.startsWith("operating.")) continue;
      const channels = plan.source === "cells" && !m.id.startsWith("operating.") ? Array.from({ length: target.bpcs * target.cells }, (_, i) => ({ b: Math.floor(i / target.cells) + 1, c: i % target.cells + 1 })).filter((x) => (!select.bpc || select.bpc === x.b) && (!select.cell || select.cell === x.c)) : [null];
      for (const c of channels) {
        const id = `${plan.source}:${target.id}${c ? `-B${c.b}-C${c.c}` : ""}:${m.id}`;
        if (series.size >= exportLimits.series && !series.has(id)) throw Error("Select at most 65,536 data series per package.");
        series.set(id, { id, label: target.label + (c ? ` \xB7 BPC ${c.b} \xB7 Cell ${c.c}` : ""), metric: m.label, unit: m.unit, source: plan.source, gapMs: 12e4, points: [] });
      }
    }
  }
  const scan = async (file, consume) => {
    const stat = await import_promises.default.lstat(file).catch((e) => {
      if (e.code === "ENOENT") {
        skipped++;
        return null;
      }
      throw e;
    });
    if (!stat) return;
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Unsafe history file refused");
    if (!stat.size) return;
    const input = (0, import_node_fs.createReadStream)(file, { encoding: "utf8", end: stat.size - 1 });
    let pending = "";
    try {
      for await (const chunk of input) {
        check();
        bytes += Buffer.byteLength(chunk);
        if (bytes > exportLimits.readBytes) throw Error("History read limit reached. Select a shorter window.");
        pending += chunk;
        let n;
        while ((n = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, n);
          pending = pending.slice(n + 1);
          if (!line) continue;
          if (line.length > 1024 * 1024) throw Error("Oversized history record");
          let record;
          try {
            record = JSON.parse(line);
          } catch {
            skipped++;
            continue;
          }
          consume(record);
        }
        if (pending.length > 1024 * 1024) throw Error("Oversized history record");
      }
      if (pending.trim()) skipped++;
    } finally {
      input.destroy();
    }
  };
  for (const plan of job.plans) {
    const selections = job.request.selections.filter((s) => s.source === plan.source);
    if (!selections.length) continue;
    const targets = new Map(plan.targets.map((t) => [t.id, t]));
    const selected = new Map(selections.map((s) => [s.target, s]));
    const arrays = new Set(selections.map((s) => targets.get(s.target).array));
    const hashes = new Set(selections.map((s) => hash(s.target)));
    const files = plan.files.filter((f) => f.at <= job.request.to && f.at + (plan.source === "cells" ? 0 : 36e5) >= job.request.from && (plan.source !== "power" || arrays.has(f.array)) && (plan.source !== "hvac" || hashes.has(f.target))).sort((a, b) => a.at - b.at);
    for (const file of files) {
      check();
      if (plan.source === "cells") {
        const stat = await import_promises.default.lstat(file.path).catch((e) => {
          if (e.code === "ENOENT") {
            skipped++;
            return null;
          }
          throw e;
        });
        if (!stat) continue;
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 ** 2) throw Error("Invalid cell history file");
        bytes += stat.size;
        if (bytes > exportLimits.readBytes) throw Error("History read limit reached. Select a shorter window.");
        let f, compressed;
        try {
          compressed = await import_promises.default.readFile(file.path);
          f = JSON.parse((await decompress(compressed, { maxOutputLength: 16 * 1024 ** 2 })).toString());
        } catch {
          skipped++;
          continue;
        }
        if (f.schema !== 1 || !f.site || hash(JSON.stringify([f.site.stationCode, f.site.blockIndex, f.site.emsBaseUrl])) !== plan.identity || f.acquiredAt !== file.at || !Array.isArray(f.strings)) throw Error("Cell history identity mismatch");
        if (f.acquiredAt < job.request.from || f.acquiredAt > job.request.to) continue;
        rawCellFiles.push({ at: f.acquiredAt, path: file.path, bytes: compressed.length });
        const bucket = Math.min(24, Math.max(0, Math.round((f.acquiredAt - job.request.from) / Math.max(1, job.request.to - job.request.from) * 24)));
        const priorFrame = cellSnapshotBuckets.get(bucket), captureFrame = !priorFrame || Math.abs(f.acquiredAt - (job.request.from + bucket * (job.request.to - job.request.from) / 24)) <= Math.abs(priorFrame.at - (job.request.from + bucket * (job.request.to - job.request.from) / 24));
        const spatialFrame = captureFrame ? { at: f.acquiredAt, arrays: /* @__PURE__ */ new Map() } : null;
        for (const r of f.strings) {
          const target = `A${r.array}-S${r.string}`, sel = selected.get(target);
          if (!sel) continue;
          if (!Number.isInteger(r.bpcCount) || !Number.isInteger(r.groupsPerBpc) || r.bpcCount < 1 || r.bpcCount > 64 || r.groupsPerBpc < 1 || r.groupsPerBpc > 128 || !Array.isArray(r.observedAt)) throw Error("Invalid cell history columns");
          for (const m of targets.get(target).metrics.filter((m2) => sel.metrics.includes(m2.id) && m2.id.startsWith("operating."))) {
            const v = value(r.operating?.[m.id.slice(10)]), at = finite(r.operating?.observedAt);
            add(`cells:${target}:${m.id}`, targets.get(target).label, m.label, m.unit, "EMS recorded string context", 12e4, [f.acquiredAt, at, v, v === null || at === null ? "missing" : freshCell(at, f.acquiredAt) ? "live" : "stale"]);
          }
          for (let i = 0; i < r.bpcCount * r.groupsPerBpc; i++) {
            const bpc = Math.floor(i / r.groupsPerBpc) + 1, cell = i % r.groupsPerBpc + 1;
            if (sel.bpc && sel.bpc !== bpc || sel.cell && sel.cell !== cell) continue;
            if (spatialFrame && (sel.metrics.includes("millivolts") || sel.metrics.includes("temperatureF"))) {
              const voltage = sel.metrics.includes("millivolts") ? finite(r.millivolts?.[i]) : null, temperature = sel.metrics.includes("temperatureF") ? finite(r.temperatureF?.[i]) : null, at = finite(r.observedAt[i]);
              const quality = r.ignoredTemperatures?.includes(i) ? "ignored" : voltage === null && temperature === null || at === null || at > f.acquiredAt + 5e3 ? "missing" : freshCell(at, f.acquiredAt) ? "live" : "stale";
              if (!spatialFrame.arrays.has(r.array)) spatialFrame.arrays.set(r.array, []);
              spatialFrame.arrays.get(r.array).push([r.array, r.string, bpc, cell, voltage, temperature, at, quality]);
            }
          }
        }
        if (spatialFrame) cellSnapshotBuckets.set(bucket, spatialFrame);
      } else await scan(file.path, (record) => {
        if (plan.source === "power") {
          const o = record?.observation;
          if (!o || !o.values) return;
          const sel = selected.get(o.entity + "|" + o.stream);
          if (!sel || !Number.isFinite(o.observedAt) || o.observedAt < job.request.from || o.observedAt > job.request.to) return;
          const t = targets.get(sel.target);
          if (o.array !== t.array) throw Error("Power history equipment identity mismatch");
          for (const m of t.metrics.filter((m2) => sel.metrics.includes(m2.id))) add(`power:${t.id}:${m.id}`, t.label, m.label, m.unit, String(o.source).slice(0, 256), o.stream === "electrical" ? 25e3 : 12e4, [o.observedAt, finite(o.sourceAt), value(o.values[m.id]), o.quality === "live" ? "live" : "unavailable"]);
        } else {
          const o = record, sel = selected.get(o?.id);
          if (!sel || !o.point || !Number.isFinite(o.point.at) || o.point.at < job.request.from || o.point.at > job.request.to) return;
          const t = targets.get(sel.target);
          if (o.array !== t.array) throw Error("HVAC history equipment identity mismatch");
          for (const m of t.metrics.filter((m2) => sel.metrics.includes(m2.id))) {
            const v = m.id.startsWith("command.") ? o.point.commands?.[m.id.slice(8)] : o.point[m.id];
            add(`hvac:${t.id}:${m.id}`, t.label, m.label, m.unit, "Feather whole-site history", 12e4, [o.point.at, finite(o.sourceAt), value(v), o.gap ? "unavailable" : o.point.quality === "Live" ? "live" : String(o.point.quality ?? "unavailable").toLowerCase(), void 0, finite(o.receivedAt)]);
          }
        }
      });
    }
  }
  if (skipped) warnings.push(`${skipped} expired, unreadable or incomplete history records/files were skipped. Export may be incomplete.`);
  check();
  const all = [...series.values()], cellSnapshots = [...cellSnapshotBuckets.values()].sort((a, b) => a.at - b.at);
  activeCellSnapshots = cellSnapshots;
  for (const s of all) s.points.sort((a, b) => a[0] - b[0]);
  const summaries = all.map((s) => coverage(s, job.request.from, job.request.to));
  const archive = new import_adm_zip.default();
  let total = 0;
  const addFile = (name, body) => {
    total += Buffer.byteLength(body);
    if (total > exportLimits.outputBytes) throw Error("Package exceeds 512 MiB before compression. Narrow the selection.");
    archive.addFile(name, Buffer.from(body));
  };
  const interactiveCellTimes = new Set(cellSnapshots.map((frame) => frame.at));
  const rawCellIndex = [["historian_frame_utc", "compressed_bytes", "included_in_interactive_replay", "retention"]];
  for (const frame of rawCellFiles) rawCellIndex.push([iso(frame.at), frame.bytes, interactiveCellTimes.has(frame.at), "Retained in PRIZM cell historian; omitted from bounded engineering ZIP"]);
  if (rawCellIndex.length > 1) addFile("csv/cell_history_frames.csv", csv(rawCellIndex));
  for (const source of ["power", "hvac", "cells"]) {
    const output = [["series_id", "equipment", "metric", "unit", "observation_time_utc", "source_time_utc", "value", "quality", "source", "received_time_utc"]];
    for (const s of all.filter((s2) => s2.id.startsWith(source + ":"))) for (const p of s.points) output.push([s.id, s.label, s.metric, s.unit, iso(p[0]), iso(p[1]), p[2], p[3], p[4] ?? s.source, iso(p[5] ?? null)]);
    if (output.length > 1) addFile(source + ".csv", csv(output));
  }
  const csvRows = (items) => {
    const output = [["series_id", "equipment", "metric", "unit", "observation_time_utc", "source_time_utc", "value", "quality", "source", "received_time_utc"]];
    for (const s of items) for (const p of s.points) output.push([s.id, s.label, s.metric, s.unit, iso(p[0]), iso(p[1]), p[2], p[3], p[4] ?? s.source, iso(p[5] ?? null)]);
    return csv(output);
  };
  const cells = all.filter((s) => s.id.startsWith("cells:")), stringMetrics = cells;
  const power = all.filter((s) => s.id.startsWith("power:")), notifications = power.filter((s) => /notification|alarm|warning|information/i.test(s.metric)), pcsPower = power.filter((s) => !notifications.includes(s));
  const hvac = all.filter((s) => s.id.startsWith("hvac:")), environmental = hvac.filter((s) => /humidity|temperature|outside/i.test(s.metric));
  const reports = [];
  for (let array = 1; array <= 8; array++) {
    const frames = cellSnapshots.map((frame) => ({ at: frame.at, arrays: new Map(frame.arrays.has(array) ? [[array, frame.arrays.get(array)]] : []) })).filter((frame) => frame.arrays.size);
    if (!frames.length) continue;
    const latest = frames.at(-1), items = latest.arrays.get(array);
    const csvName = `csv/cells_array_${array}.csv`, htmlName = `html/cells_array_${array}.html`, imageName = `images/cells_array_${array}.svg`;
    const snapshotCsv = [["historian_frame_utc","array","string","bpc","cell","voltage_mv","temperature_f","source_time_utc","quality"], ...items.map((r) => [iso(latest.at),r[0],r[1],r[2],r[3],r[4],r[5],iso(r[6]),r[7]])];
    addFile(csvName, csv(snapshotCsv));
    addFile(htmlName, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline'"><title>${htmlEscape(job.site)} · Array ${array} cells</title><style>body{font:15px system-ui;color:#14312b;max-width:1320px;margin:28px auto;padding:0 18px}a{color:#087253}.cell-spatial{border:1px solid #c6d7d0;border-radius:8px;padding:16px}input{width:100%}.cell-chart svg{width:100%;height:360px}.scroll{max-height:520px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:7px;border-bottom:1px solid #dbe5e1}</style><p><a href="../index.html">← Engineering package index</a></p>${cellSpatialExplorer(frames,array)}${cellSpatialScript()}</html>`);
    addFile(imageName, cellSnapshotSvg(items, "voltage", `Array ${array} cell voltage`));
    reports.push({label:`Array ${array} cells`,html:htmlName,csv:csvName,image:imageName});
  }
  for (const report of [
    {key:"string_metrics",label:"String metrics",items:stringMetrics},
    {key:"pcs_power",label:"PCS power and EMS applications",items:pcsPower},
    {key:"hvac",label:"HVAC",items:hvac},
    {key:"environmental",label:"Environmental",items:environmental},
    {key:"notifications",label:"Notifications",items:notifications},
  ]) {
    if (!report.items.length) continue;
    const csvName = `csv/${report.key}.csv`, htmlName = `html/${report.key}.html`, imageName = `images/${report.key}.svg`;
    addFile(csvName, csvRows(report.items));addFile(htmlName, offlineFamilyPage(`${job.site} · ${report.label}`, report.items, job.request.from, job.request.to));addFile(imageName, latestSpatialSvg(report.items, report.label));
    reports.push({label:report.label,html:htmlName,csv:csvName,image:imageName});
  }
  addFile("index.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';img-src 'self'"><title>${htmlEscape(job.site)} engineering package</title><style>body{font:16px system-ui;color:#14312b;max-width:1200px;margin:30px auto;padding:0 18px}a{color:#087253;text-decoration:none}li{padding:8px 0;border-bottom:1px solid #dbe5e1}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}.card{border:1px solid #c6d7d0;border-radius:8px;padding:10px}.card img{display:block;width:100%;height:170px;object-fit:contain}.card span{display:block;margin-top:8px;font-weight:650}</style><h1>${htmlEscape(job.site)}</h1><p>${htmlEscape(iso(job.request.from))} — ${htmlEscape(iso(job.request.to))} · UTC</p><p><a href="report.html">Open the complete interactive data explorer</a></p><h2>Reports</h2><ul>${reports.map((r) => `<li><a href="${r.html}">${htmlEscape(r.label)}</a> · <a href="${r.csv}">CSV</a></li>`).join("")}</ul><h2>Graph gallery</h2><div class="gallery">${reports.map((r) => `<a class="card" href="${r.html}"><img src="${r.image}" alt="${htmlEscape(r.label)}"><span>${htmlEscape(r.label)}</span></a>`).join("")}</div><h2>Package evidence</h2><ul><li><a href="coverage.csv">Coverage and gaps</a></li><li><a href="manifest.json">Manifest</a></li><li><a href="README.txt">Interpretation notes</a></li></ul></html>`);
  addFile("coverage.csv", csv([["series_id", "equipment", "metric", "unit", "rows", "distinct_live_source_times", "first_live_utc", "last_live_utc", "largest_gap_seconds", "shortest_step_seconds", "longest_step_seconds"], ...summaries.map((s) => [s.id, s.label, s.metric, s.unit, s.rows, s.valid, iso(s.first), iso(s.last), s.largestGapMs / 1e3, s.shortestStepMs === null ? null : s.shortestStepMs / 1e3, s.longestStepMs === null ? null : s.longestStepMs / 1e3])]));
  addFile("manifest.json", JSON.stringify({ schema: 2, site: job.site, from: iso(job.request.from), to: iso(job.request.to), createdAt: (/* @__PURE__ */ new Date()).toISOString(), selection: job.request.selections, rows, cellHistory: { retainedFrames: rawCellFiles.length, interactiveFrames: cellSnapshots.map((frame) => iso(frame.at)), preservation: "All frame timestamps and sizes are indexed in csv/cell_history_frames.csv. The bounded engineering ZIP contains up to 25 representative actual frames; complete compressed frames remain in the PRIZM historian for a dedicated raw archive workflow." }, warnings, coverage: summaries }, null, 2));
  addFile("README.txt", `PRIZM selected history export
Site: ${job.site}
UTC window: ${iso(job.request.from)} to ${iso(job.request.to)}

${warnings.join("\n\n")}

Open report.html offline. All times are UTC. Source time is when the provider reports the measurement; observation time is the recorded frame/point time. HVAC receipt time is included in received_time_utc when available in the recording (not fabricated). No fill-forward, interpolation, or zero substitution. All selected cell historian frame timestamps and compressed sizes are indexed by csv/cell_history_frames.csv. Interactive cell replay uses at most 25 representative frames selected from actual historian timestamps; it never invents or interpolates a frame. Complete compressed cell frames remain retained in PRIZM for a dedicated raw archive workflow instead of being duplicated into this bounded browser package. Each array CSV is the final retained spatial frame in the selected window. Command values are reported states/setpoints, not proof of physical execution. Measured PCS power is telemetry, not independent meter verification. Whole-unit HVAC current includes compressor, fan and other loads. Temperature units are explicit. CSV text beginning with formula characters is prefixed with an apostrophe for spreadsheet safety.
`);
  const h = htmlEscape;
  const sliderData = all.map((s) => {
    const buckets = /* @__PURE__ */ new Map();
    for (const point of s.points) {
      if (!Number.isFinite(point[0]) || point[0] < job.request.from || point[0] > job.request.to) continue;
      const bucket = Math.min(240, Math.max(0, Math.floor((point[0] - job.request.from) / (job.request.to - job.request.from) * 240)));
      buckets.set(bucket, [point[0], point[2], point[3], point[4] ?? s.source]);
    }
    return {label:s.label,metric:s.metric,unit:s.unit,points:[...buckets]};
  });
  const sliderJson = JSON.stringify(sliderData).replace(/</g, "\\u003c");
  addFile("report.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>PRIZM data export</title><style>body{font:16px system-ui;color:#14312b;background:#f4f7f6;margin:24px auto;max-width:1440px;padding:0 16px}h1{margin-bottom:8px}details,.engineering-family,.time-inspector{background:white;padding:16px;margin:12px 0;border:1px solid #c6d7d0;border-radius:8px}summary{cursor:pointer;font-weight:650}svg{width:100%;max-height:260px}input{padding:12px;width:min(90%,600px)}input[type=range]{width:100%}small{color:#455e57}li{margin-bottom:6px}.window{font-weight:600}p{overflow-wrap:anywhere}.legend{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:12px}.legend span{display:inline-flex;align-items:center;gap:5px}.legend i{width:12px;height:4px;display:inline-block}.time-inspector table{width:100%;border-collapse:collapse}.time-inspector th,.time-inspector td{text-align:left;padding:7px;border-bottom:1px solid #dbe5e1;font-size:13px}.time-inspector .scroll{max-height:420px;overflow:auto}.engineering-family>h2{margin-bottom:6px}.engineering-plot{margin-top:10px}.plot-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;color:#526760;font-size:12px;margin-bottom:8px}.plot-toolbar button,.plot-legend-item{font:inherit;border:1px solid #bdcbc6;background:#fff;border-radius:5px;padding:5px 9px;cursor:pointer}.plot-legend{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.plot-legend-item{display:inline-flex;align-items:center;gap:6px;max-width:100%;text-align:left}.plot-legend-item[aria-pressed=false]{opacity:.35;text-decoration:line-through}.plot-legend-item i{width:18px;height:3px;flex:none}.plot-stage{position:relative;height:440px;min-height:320px;border:1px solid #d7e0dc;background:#fff}.plot-stage canvas{width:100%;height:100%;display:block}.plot-tooltip{position:absolute;pointer-events:none;z-index:2;max-width:420px;padding:9px 11px;background:rgba(20,35,31,.94);color:#fff;border-radius:5px;font-size:12px;line-height:1.45;box-shadow:0 3px 12px #0004}.plot-tooltip b{display:block;margin-bottom:4px}.plot-tooltip span{display:block;white-space:nowrap}@media(max-width:700px){.plot-stage{height:340px}.plot-toolbar{align-items:flex-start;flex-direction:column}}</style><h1>PRIZM selected history</h1><p>${h(job.site)}</p><p class="window">${h(iso(job.request.from))} \u2014 ${h(iso(job.request.to))}</p><p>${rows.toLocaleString("en-US")} recorded readings \xB7 ${all.length} selected series \xB7 UTC</p><section class="time-inspector"><h2>Point-in-time inspector</h2><p>Move the timeline to see the latest recorded value at or before the selected moment. Values are not interpolated or substituted.</p><input id="timeline" type="range" min="0" max="240" value="240" aria-label="Selected point in time"><p><strong id="timeline-time"></strong></p><div class="scroll"><table><thead><tr><th>Equipment</th><th>Measurement</th><th>Value</th><th>Quality</th><th>Recorded at</th></tr></thead><tbody id="timeline-values"></tbody></table></div></section><details><summary>Coverage and interpretation</summary><ul>${warnings.map((w) => `<li>${h(w)}</li>`).join("")}</ul><p>See coverage.csv and manifest.json for every selected series, including those with no data. Use the CSV files for full retained resolution.</p></details><h2>Engineering overview</h2><p>Related command, setting, actual, electrical, thermal, environmental, and notification series are aligned for direct comparison.</p>${engineeringFamilySections(all,job.request.from,job.request.to)}<h2>Individual series evidence</h2><label>Find equipment or measurement <input id="filter" type="search" placeholder="Array, string, HVAC, command, notification\u2026"></label>${all.map((s, i) => {
    const c = summaries[i];
    return `<details class="series"><summary>${h(s.label)} \xB7 ${h(s.metric)} (${h(s.unit)})</summary><p>${c.rows} rows; ${c.valid} distinct live source times. Largest gap including edges: ${(c.largestGapMs / 6e4).toFixed(1)} min.</p><p>First / last live source: ${h(iso(c.first) || "Not available")} / ${h(iso(c.last) || "Not available")}</p>${graph(s, job.request.from, job.request.to)}<small>${h(iso(job.request.from))} \u2014 ${h(iso(job.request.to))} \xB7 hover over marks for bucket evidence</small></details>`;
  }).join("")}<script>function initEngineeringPlots(){for(const root of document.querySelectorAll('.engineering-plot')){const data=JSON.parse(root.querySelector('.plot-data').textContent),canvas=root.querySelector('canvas'),tip=root.querySelector('.plot-tooltip'),ctx=canvas.getContext('2d'),hidden=new Set();let viewFrom=data.from,viewTo=data.to,drag=null,hoverX=null;const pad={l:76,r:24,t:22,b:54};function size(){const d=devicePixelRatio||1,w=Math.max(500,canvas.clientWidth),h=Math.max(300,canvas.clientHeight);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);return{w,h}}function x(t,w){return pad.l+(t-viewFrom)/(viewTo-viewFrom)*(w-pad.l-pad.r)}function y(v,h){const span=data.high-data.low||1;return pad.t+(data.high-v)/span*(h-pad.t-pad.b)}function fmt(v){const a=Math.abs(v);return a>=1000?v.toLocaleString(undefined,{maximumFractionDigits:1}):v.toLocaleString(undefined,{maximumFractionDigits:2})}function draw(){const z=size(),w=z.w,h=z.h,pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;ctx.clearRect(0,0,w,h);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#dbe3e0';ctx.lineWidth=1;ctx.font='12px system-ui';ctx.fillStyle='#526760';ctx.textAlign='right';ctx.textBaseline='middle';for(let i=0;i<=5;i++){const yy=pad.t+ph*i/5,val=data.high-(data.high-data.low)*i/5;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillText(fmt(val),pad.l-9,yy)}ctx.textAlign='center';ctx.textBaseline='top';for(let i=0;i<=8;i++){const xx=pad.l+pw*i/8,at=viewFrom+(viewTo-viewFrom)*i/8;ctx.beginPath();ctx.moveTo(xx,pad.t);ctx.lineTo(xx,h-pad.b);ctx.stroke();ctx.fillText(new Date(at).toISOString().slice(5,16).replace('T',' '),xx,h-pad.b+10)}ctx.save();ctx.translate(17,pad.t+ph/2);ctx.rotate(-Math.PI/2);ctx.fillText(data.unit,0,0);ctx.restore();ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,pw,ph);ctx.clip();data.traces.forEach(function(trace,ti){if(hidden.has(ti))return;const pts=trace.points.filter(function(p){return p[0]>=viewFrom&&p[0]<=viewTo});ctx.strokeStyle=trace.color;ctx.lineWidth=1.45;ctx.globalAlpha=.92;ctx.beginPath();let started=false;for(const p of pts){const xx=x(p[0],w),mid=(p[1]+p[2])/2,yy=y(mid,h);if(started)ctx.lineTo(xx,yy);else{ctx.moveTo(xx,yy);started=true}}ctx.stroke();ctx.globalAlpha=.32;ctx.beginPath();for(const p of pts){const xx=x(p[0],w);ctx.moveTo(xx,y(p[1],h));ctx.lineTo(xx,y(p[2],h))}ctx.stroke();ctx.globalAlpha=1});if(hoverX!==null){ctx.strokeStyle='#263b35';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(hoverX,pad.t);ctx.lineTo(hoverX,h-pad.b);ctx.stroke();ctx.setLineDash([])}ctx.restore()}function nearest(clientX){const r=canvas.getBoundingClientRect(),w=canvas.clientWidth,h=canvas.clientHeight,px=clientX-r.left;if(px<pad.l||px>w-pad.r)return null;const at=viewFrom+(px-pad.l)/(w-pad.l-pad.r)*(viewTo-viewFrom),rows=[];let nearestAt=null,best=Infinity;data.traces.forEach(function(trace,ti){if(hidden.has(ti))return;let hit=null,delta=Infinity;for(const p of trace.points){const d=Math.abs(p[0]-at);if(d<delta){delta=d;hit=p}}if(hit){rows.push({trace:trace,p:hit});if(delta<best){best=delta;nearestAt=hit[0]}}});return{px:nearestAt===null?px:x(nearestAt,w),at:nearestAt,rows:rows}}function show(e){if(drag)return;const hit=nearest(e.clientX);if(!hit){hoverX=null;tip.hidden=true;draw();return}hoverX=hit.px;draw();tip.replaceChildren();const b=document.createElement('b');b.textContent=new Date(hit.at).toISOString();tip.appendChild(b);for(const row of hit.rows){const span=document.createElement('span');span.textContent=row.trace.label+': '+fmt((row.p[1]+row.p[2])/2)+' '+data.unit+(row.p[1]!==row.p[2]?' ['+fmt(row.p[1])+'–'+fmt(row.p[2])+']':'');span.style.color=row.trace.color;tip.appendChild(span)}tip.hidden=false;const box=canvas.getBoundingClientRect();tip.style.left=Math.min(box.width-tip.offsetWidth-8,Math.max(8,hit.px+12))+'px';tip.style.top='10px'}root.querySelectorAll('.plot-legend-item').forEach(function(button){button.addEventListener('click',function(){const n=Number(button.dataset.trace);if(hidden.has(n))hidden.delete(n);else hidden.add(n);button.setAttribute('aria-pressed',String(!hidden.has(n)));draw()})});root.querySelector('.plot-reset').addEventListener('click',function(){viewFrom=data.from;viewTo=data.to;draw()});canvas.addEventListener('wheel',function(e){e.preventDefault();const r=canvas.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(e.clientX-r.left-pad.l)/(canvas.clientWidth-pad.l-pad.r))),span=viewTo-viewFrom,factor=e.deltaY>0?1.35:.72,next=Math.max(60000,Math.min(data.to-data.from,span*factor)),center=viewFrom+ratio*span;viewFrom=Math.max(data.from,Math.min(data.to-next,center-ratio*next));viewTo=viewFrom+next;draw()},{passive:false});canvas.addEventListener('pointerdown',function(e){drag={x:e.clientX,from:viewFrom,to:viewTo};canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',function(e){if(!drag){show(e);return}const span=drag.to-drag.from,dx=(e.clientX-drag.x)/(canvas.clientWidth-pad.l-pad.r)*span;viewFrom=Math.max(data.from,Math.min(data.to-span,drag.from-dx));viewTo=viewFrom+span;tip.hidden=true;hoverX=null;draw()});canvas.addEventListener('pointerup',function(){drag=null});canvas.addEventListener('pointerleave',function(){if(!drag){tip.hidden=true;hoverX=null;draw()}});new ResizeObserver(draw).observe(canvas);draw()}}initEngineeringPlots();const timelineData=${sliderJson},timelineFrom=${job.request.from},timelineTo=${job.request.to};function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}function renderTimeline(){const bucket=Number(document.getElementById('timeline').value),at=timelineFrom+(timelineTo-timelineFrom)*bucket/240;document.getElementById('timeline-time').textContent=new Date(at).toISOString();const rows=[];for(const s of timelineData){let found=null;for(const p of s.points){if(p[0]>bucket)break;found=p[1]}if(found)rows.push('<tr><td>'+esc(s.label)+'</td><td>'+esc(s.metric)+'</td><td>'+esc(found[1])+' '+esc(s.unit)+'</td><td>'+esc(found[2])+'</td><td>'+esc(new Date(found[0]).toISOString())+'</td></tr>')}document.getElementById('timeline-values').innerHTML=rows.join('')||'<tr><td colspan="5">No selected measurements were recorded at or before this moment.</td></tr>'}document.getElementById('timeline').addEventListener('input',renderTimeline);renderTimeline();document.getElementById('filter').addEventListener('input',function(){for(const d of document.querySelectorAll('.series'))d.hidden=!d.querySelector('summary').textContent.toLowerCase().includes(this.value.toLowerCase())});</script></html>`);
  check();
  const zipped = await archive.toBufferPromise();
  check();
  if (zipped.length > exportLimits.zipBytes) throw Error("Compressed package exceeds 256 MiB. Narrow the selection.");
  return { archive: zipped, coverage: summaries, rows, warnings };
}

// src/server/dataExport/worker.ts
import_node_worker_threads.parentPort.once("message", async (job) => {
  try {
    import_node_worker_threads.parentPort.postMessage({ result: await buildExport(job) });
  } catch (e) {
    import_node_worker_threads.parentPort.postMessage({ error: e instanceof Error ? e.message : "Export failed" });
  }
});
