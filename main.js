var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all3) => {
  for (var name in all3)
    __defProp(target, name, { get: all3[name], enumerable: true });
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/delayed-stream/lib/delayed_stream.js
var require_delayed_stream = __commonJS({
  "node_modules/delayed-stream/lib/delayed_stream.js"(exports2, module2) {
    var Stream = require("stream").Stream;
    var util3 = require("util");
    module2.exports = DelayedStream;
    function DelayedStream() {
      this.source = null;
      this.dataSize = 0;
      this.maxDataSize = 1024 * 1024;
      this.pauseStream = true;
      this._maxDataSizeExceeded = false;
      this._released = false;
      this._bufferedEvents = [];
    }
    util3.inherits(DelayedStream, Stream);
    DelayedStream.create = function(source, options) {
      var delayedStream = new this();
      options = options || {};
      for (var option in options) {
        delayedStream[option] = options[option];
      }
      delayedStream.source = source;
      var realEmit = source.emit;
      source.emit = function() {
        delayedStream._handleEmit(arguments);
        return realEmit.apply(source, arguments);
      };
      source.on("error", function() {
      });
      if (delayedStream.pauseStream) {
        source.pause();
      }
      return delayedStream;
    };
    Object.defineProperty(DelayedStream.prototype, "readable", {
      configurable: true,
      enumerable: true,
      get: function() {
        return this.source.readable;
      }
    });
    DelayedStream.prototype.setEncoding = function() {
      return this.source.setEncoding.apply(this.source, arguments);
    };
    DelayedStream.prototype.resume = function() {
      if (!this._released) {
        this.release();
      }
      this.source.resume();
    };
    DelayedStream.prototype.pause = function() {
      this.source.pause();
    };
    DelayedStream.prototype.release = function() {
      this._released = true;
      this._bufferedEvents.forEach(function(args) {
        this.emit.apply(this, args);
      }.bind(this));
      this._bufferedEvents = [];
    };
    DelayedStream.prototype.pipe = function() {
      var r = Stream.prototype.pipe.apply(this, arguments);
      this.resume();
      return r;
    };
    DelayedStream.prototype._handleEmit = function(args) {
      if (this._released) {
        this.emit.apply(this, args);
        return;
      }
      if (args[0] === "data") {
        this.dataSize += args[1].length;
        this._checkIfMaxDataSizeExceeded();
      }
      this._bufferedEvents.push(args);
    };
    DelayedStream.prototype._checkIfMaxDataSizeExceeded = function() {
      if (this._maxDataSizeExceeded) {
        return;
      }
      if (this.dataSize <= this.maxDataSize) {
        return;
      }
      this._maxDataSizeExceeded = true;
      var message = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
      this.emit("error", new Error(message));
    };
  }
});

// node_modules/combined-stream/lib/combined_stream.js
var require_combined_stream = __commonJS({
  "node_modules/combined-stream/lib/combined_stream.js"(exports2, module2) {
    var util3 = require("util");
    var Stream = require("stream").Stream;
    var DelayedStream = require_delayed_stream();
    module2.exports = CombinedStream;
    function CombinedStream() {
      this.writable = false;
      this.readable = true;
      this.dataSize = 0;
      this.maxDataSize = 2 * 1024 * 1024;
      this.pauseStreams = true;
      this._released = false;
      this._streams = [];
      this._currentStream = null;
      this._insideLoop = false;
      this._pendingNext = false;
    }
    util3.inherits(CombinedStream, Stream);
    CombinedStream.create = function(options) {
      var combinedStream = new this();
      options = options || {};
      for (var option in options) {
        combinedStream[option] = options[option];
      }
      return combinedStream;
    };
    CombinedStream.isStreamLike = function(stream4) {
      return typeof stream4 !== "function" && typeof stream4 !== "string" && typeof stream4 !== "boolean" && typeof stream4 !== "number" && !Buffer.isBuffer(stream4);
    };
    CombinedStream.prototype.append = function(stream4) {
      var isStreamLike = CombinedStream.isStreamLike(stream4);
      if (isStreamLike) {
        if (!(stream4 instanceof DelayedStream)) {
          var newStream = DelayedStream.create(stream4, {
            maxDataSize: Infinity,
            pauseStream: this.pauseStreams
          });
          stream4.on("data", this._checkDataSize.bind(this));
          stream4 = newStream;
        }
        this._handleErrors(stream4);
        if (this.pauseStreams) {
          stream4.pause();
        }
      }
      this._streams.push(stream4);
      return this;
    };
    CombinedStream.prototype.pipe = function(dest, options) {
      Stream.prototype.pipe.call(this, dest, options);
      this.resume();
      return dest;
    };
    CombinedStream.prototype._getNext = function() {
      this._currentStream = null;
      if (this._insideLoop) {
        this._pendingNext = true;
        return;
      }
      this._insideLoop = true;
      try {
        do {
          this._pendingNext = false;
          this._realGetNext();
        } while (this._pendingNext);
      } finally {
        this._insideLoop = false;
      }
    };
    CombinedStream.prototype._realGetNext = function() {
      var stream4 = this._streams.shift();
      if (typeof stream4 == "undefined") {
        this.end();
        return;
      }
      if (typeof stream4 !== "function") {
        this._pipeNext(stream4);
        return;
      }
      var getStream = stream4;
      getStream(function(stream5) {
        var isStreamLike = CombinedStream.isStreamLike(stream5);
        if (isStreamLike) {
          stream5.on("data", this._checkDataSize.bind(this));
          this._handleErrors(stream5);
        }
        this._pipeNext(stream5);
      }.bind(this));
    };
    CombinedStream.prototype._pipeNext = function(stream4) {
      this._currentStream = stream4;
      var isStreamLike = CombinedStream.isStreamLike(stream4);
      if (isStreamLike) {
        stream4.on("end", this._getNext.bind(this));
        stream4.pipe(this, { end: false });
        return;
      }
      var value = stream4;
      this.write(value);
      this._getNext();
    };
    CombinedStream.prototype._handleErrors = function(stream4) {
      var self2 = this;
      stream4.on("error", function(err) {
        self2._emitError(err);
      });
    };
    CombinedStream.prototype.write = function(data) {
      this.emit("data", data);
    };
    CombinedStream.prototype.pause = function() {
      if (!this.pauseStreams) {
        return;
      }
      if (this.pauseStreams && this._currentStream && typeof this._currentStream.pause == "function") this._currentStream.pause();
      this.emit("pause");
    };
    CombinedStream.prototype.resume = function() {
      if (!this._released) {
        this._released = true;
        this.writable = true;
        this._getNext();
      }
      if (this.pauseStreams && this._currentStream && typeof this._currentStream.resume == "function") this._currentStream.resume();
      this.emit("resume");
    };
    CombinedStream.prototype.end = function() {
      this._reset();
      this.emit("end");
    };
    CombinedStream.prototype.destroy = function() {
      this._reset();
      this.emit("close");
    };
    CombinedStream.prototype._reset = function() {
      this.writable = false;
      this._streams = [];
      this._currentStream = null;
    };
    CombinedStream.prototype._checkDataSize = function() {
      this._updateDataSize();
      if (this.dataSize <= this.maxDataSize) {
        return;
      }
      var message = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
      this._emitError(new Error(message));
    };
    CombinedStream.prototype._updateDataSize = function() {
      this.dataSize = 0;
      var self2 = this;
      this._streams.forEach(function(stream4) {
        if (!stream4.dataSize) {
          return;
        }
        self2.dataSize += stream4.dataSize;
      });
      if (this._currentStream && this._currentStream.dataSize) {
        this.dataSize += this._currentStream.dataSize;
      }
    };
    CombinedStream.prototype._emitError = function(err) {
      this._reset();
      this.emit("error", err);
    };
  }
});

// node_modules/mime-db/db.json
var require_db = __commonJS({
  "node_modules/mime-db/db.json"(exports2, module2) {
    module2.exports = {
      "application/1d-interleaved-parityfec": {
        source: "iana"
      },
      "application/3gpdash-qoe-report+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/3gpp-ims+xml": {
        source: "iana",
        compressible: true
      },
      "application/3gpphal+json": {
        source: "iana",
        compressible: true
      },
      "application/3gpphalforms+json": {
        source: "iana",
        compressible: true
      },
      "application/a2l": {
        source: "iana"
      },
      "application/ace+cbor": {
        source: "iana"
      },
      "application/activemessage": {
        source: "iana"
      },
      "application/activity+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-costmap+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-costmapfilter+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-directory+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointcost+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointcostparams+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointprop+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointpropparams+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-error+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-networkmap+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-networkmapfilter+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-updatestreamcontrol+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-updatestreamparams+json": {
        source: "iana",
        compressible: true
      },
      "application/aml": {
        source: "iana"
      },
      "application/andrew-inset": {
        source: "iana",
        extensions: ["ez"]
      },
      "application/applefile": {
        source: "iana"
      },
      "application/applixware": {
        source: "apache",
        extensions: ["aw"]
      },
      "application/at+jwt": {
        source: "iana"
      },
      "application/atf": {
        source: "iana"
      },
      "application/atfx": {
        source: "iana"
      },
      "application/atom+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atom"]
      },
      "application/atomcat+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomcat"]
      },
      "application/atomdeleted+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomdeleted"]
      },
      "application/atomicmail": {
        source: "iana"
      },
      "application/atomsvc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomsvc"]
      },
      "application/atsc-dwd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dwd"]
      },
      "application/atsc-dynamic-event-message": {
        source: "iana"
      },
      "application/atsc-held+xml": {
        source: "iana",
        compressible: true,
        extensions: ["held"]
      },
      "application/atsc-rdt+json": {
        source: "iana",
        compressible: true
      },
      "application/atsc-rsat+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rsat"]
      },
      "application/atxml": {
        source: "iana"
      },
      "application/auth-policy+xml": {
        source: "iana",
        compressible: true
      },
      "application/bacnet-xdd+zip": {
        source: "iana",
        compressible: false
      },
      "application/batch-smtp": {
        source: "iana"
      },
      "application/bdoc": {
        compressible: false,
        extensions: ["bdoc"]
      },
      "application/beep+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/calendar+json": {
        source: "iana",
        compressible: true
      },
      "application/calendar+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xcs"]
      },
      "application/call-completion": {
        source: "iana"
      },
      "application/cals-1840": {
        source: "iana"
      },
      "application/captive+json": {
        source: "iana",
        compressible: true
      },
      "application/cbor": {
        source: "iana"
      },
      "application/cbor-seq": {
        source: "iana"
      },
      "application/cccex": {
        source: "iana"
      },
      "application/ccmp+xml": {
        source: "iana",
        compressible: true
      },
      "application/ccxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ccxml"]
      },
      "application/cdfx+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cdfx"]
      },
      "application/cdmi-capability": {
        source: "iana",
        extensions: ["cdmia"]
      },
      "application/cdmi-container": {
        source: "iana",
        extensions: ["cdmic"]
      },
      "application/cdmi-domain": {
        source: "iana",
        extensions: ["cdmid"]
      },
      "application/cdmi-object": {
        source: "iana",
        extensions: ["cdmio"]
      },
      "application/cdmi-queue": {
        source: "iana",
        extensions: ["cdmiq"]
      },
      "application/cdni": {
        source: "iana"
      },
      "application/cea": {
        source: "iana"
      },
      "application/cea-2018+xml": {
        source: "iana",
        compressible: true
      },
      "application/cellml+xml": {
        source: "iana",
        compressible: true
      },
      "application/cfw": {
        source: "iana"
      },
      "application/city+json": {
        source: "iana",
        compressible: true
      },
      "application/clr": {
        source: "iana"
      },
      "application/clue+xml": {
        source: "iana",
        compressible: true
      },
      "application/clue_info+xml": {
        source: "iana",
        compressible: true
      },
      "application/cms": {
        source: "iana"
      },
      "application/cnrp+xml": {
        source: "iana",
        compressible: true
      },
      "application/coap-group+json": {
        source: "iana",
        compressible: true
      },
      "application/coap-payload": {
        source: "iana"
      },
      "application/commonground": {
        source: "iana"
      },
      "application/conference-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/cose": {
        source: "iana"
      },
      "application/cose-key": {
        source: "iana"
      },
      "application/cose-key-set": {
        source: "iana"
      },
      "application/cpl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cpl"]
      },
      "application/csrattrs": {
        source: "iana"
      },
      "application/csta+xml": {
        source: "iana",
        compressible: true
      },
      "application/cstadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/csvm+json": {
        source: "iana",
        compressible: true
      },
      "application/cu-seeme": {
        source: "apache",
        extensions: ["cu"]
      },
      "application/cwt": {
        source: "iana"
      },
      "application/cybercash": {
        source: "iana"
      },
      "application/dart": {
        compressible: true
      },
      "application/dash+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpd"]
      },
      "application/dash-patch+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpp"]
      },
      "application/dashdelta": {
        source: "iana"
      },
      "application/davmount+xml": {
        source: "iana",
        compressible: true,
        extensions: ["davmount"]
      },
      "application/dca-rft": {
        source: "iana"
      },
      "application/dcd": {
        source: "iana"
      },
      "application/dec-dx": {
        source: "iana"
      },
      "application/dialog-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/dicom": {
        source: "iana"
      },
      "application/dicom+json": {
        source: "iana",
        compressible: true
      },
      "application/dicom+xml": {
        source: "iana",
        compressible: true
      },
      "application/dii": {
        source: "iana"
      },
      "application/dit": {
        source: "iana"
      },
      "application/dns": {
        source: "iana"
      },
      "application/dns+json": {
        source: "iana",
        compressible: true
      },
      "application/dns-message": {
        source: "iana"
      },
      "application/docbook+xml": {
        source: "apache",
        compressible: true,
        extensions: ["dbk"]
      },
      "application/dots+cbor": {
        source: "iana"
      },
      "application/dskpp+xml": {
        source: "iana",
        compressible: true
      },
      "application/dssc+der": {
        source: "iana",
        extensions: ["dssc"]
      },
      "application/dssc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdssc"]
      },
      "application/dvcs": {
        source: "iana"
      },
      "application/ecmascript": {
        source: "iana",
        compressible: true,
        extensions: ["es", "ecma"]
      },
      "application/edi-consent": {
        source: "iana"
      },
      "application/edi-x12": {
        source: "iana",
        compressible: false
      },
      "application/edifact": {
        source: "iana",
        compressible: false
      },
      "application/efi": {
        source: "iana"
      },
      "application/elm+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/elm+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.cap+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/emergencycalldata.comment+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.control+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.deviceinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.ecall.msd": {
        source: "iana"
      },
      "application/emergencycalldata.providerinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.serviceinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.subscriberinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.veds+xml": {
        source: "iana",
        compressible: true
      },
      "application/emma+xml": {
        source: "iana",
        compressible: true,
        extensions: ["emma"]
      },
      "application/emotionml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["emotionml"]
      },
      "application/encaprtp": {
        source: "iana"
      },
      "application/epp+xml": {
        source: "iana",
        compressible: true
      },
      "application/epub+zip": {
        source: "iana",
        compressible: false,
        extensions: ["epub"]
      },
      "application/eshop": {
        source: "iana"
      },
      "application/exi": {
        source: "iana",
        extensions: ["exi"]
      },
      "application/expect-ct-report+json": {
        source: "iana",
        compressible: true
      },
      "application/express": {
        source: "iana",
        extensions: ["exp"]
      },
      "application/fastinfoset": {
        source: "iana"
      },
      "application/fastsoap": {
        source: "iana"
      },
      "application/fdt+xml": {
        source: "iana",
        compressible: true,
        extensions: ["fdt"]
      },
      "application/fhir+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/fhir+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/fido.trusted-apps+json": {
        compressible: true
      },
      "application/fits": {
        source: "iana"
      },
      "application/flexfec": {
        source: "iana"
      },
      "application/font-sfnt": {
        source: "iana"
      },
      "application/font-tdpfr": {
        source: "iana",
        extensions: ["pfr"]
      },
      "application/font-woff": {
        source: "iana",
        compressible: false
      },
      "application/framework-attributes+xml": {
        source: "iana",
        compressible: true
      },
      "application/geo+json": {
        source: "iana",
        compressible: true,
        extensions: ["geojson"]
      },
      "application/geo+json-seq": {
        source: "iana"
      },
      "application/geopackage+sqlite3": {
        source: "iana"
      },
      "application/geoxacml+xml": {
        source: "iana",
        compressible: true
      },
      "application/gltf-buffer": {
        source: "iana"
      },
      "application/gml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["gml"]
      },
      "application/gpx+xml": {
        source: "apache",
        compressible: true,
        extensions: ["gpx"]
      },
      "application/gxf": {
        source: "apache",
        extensions: ["gxf"]
      },
      "application/gzip": {
        source: "iana",
        compressible: false,
        extensions: ["gz"]
      },
      "application/h224": {
        source: "iana"
      },
      "application/held+xml": {
        source: "iana",
        compressible: true
      },
      "application/hjson": {
        extensions: ["hjson"]
      },
      "application/http": {
        source: "iana"
      },
      "application/hyperstudio": {
        source: "iana",
        extensions: ["stk"]
      },
      "application/ibe-key-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/ibe-pkg-reply+xml": {
        source: "iana",
        compressible: true
      },
      "application/ibe-pp-data": {
        source: "iana"
      },
      "application/iges": {
        source: "iana"
      },
      "application/im-iscomposing+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/index": {
        source: "iana"
      },
      "application/index.cmd": {
        source: "iana"
      },
      "application/index.obj": {
        source: "iana"
      },
      "application/index.response": {
        source: "iana"
      },
      "application/index.vnd": {
        source: "iana"
      },
      "application/inkml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ink", "inkml"]
      },
      "application/iotp": {
        source: "iana"
      },
      "application/ipfix": {
        source: "iana",
        extensions: ["ipfix"]
      },
      "application/ipp": {
        source: "iana"
      },
      "application/isup": {
        source: "iana"
      },
      "application/its+xml": {
        source: "iana",
        compressible: true,
        extensions: ["its"]
      },
      "application/java-archive": {
        source: "apache",
        compressible: false,
        extensions: ["jar", "war", "ear"]
      },
      "application/java-serialized-object": {
        source: "apache",
        compressible: false,
        extensions: ["ser"]
      },
      "application/java-vm": {
        source: "apache",
        compressible: false,
        extensions: ["class"]
      },
      "application/javascript": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["js", "mjs"]
      },
      "application/jf2feed+json": {
        source: "iana",
        compressible: true
      },
      "application/jose": {
        source: "iana"
      },
      "application/jose+json": {
        source: "iana",
        compressible: true
      },
      "application/jrd+json": {
        source: "iana",
        compressible: true
      },
      "application/jscalendar+json": {
        source: "iana",
        compressible: true
      },
      "application/json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["json", "map"]
      },
      "application/json-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/json-seq": {
        source: "iana"
      },
      "application/json5": {
        extensions: ["json5"]
      },
      "application/jsonml+json": {
        source: "apache",
        compressible: true,
        extensions: ["jsonml"]
      },
      "application/jwk+json": {
        source: "iana",
        compressible: true
      },
      "application/jwk-set+json": {
        source: "iana",
        compressible: true
      },
      "application/jwt": {
        source: "iana"
      },
      "application/kpml-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/kpml-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/ld+json": {
        source: "iana",
        compressible: true,
        extensions: ["jsonld"]
      },
      "application/lgr+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lgr"]
      },
      "application/link-format": {
        source: "iana"
      },
      "application/load-control+xml": {
        source: "iana",
        compressible: true
      },
      "application/lost+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lostxml"]
      },
      "application/lostsync+xml": {
        source: "iana",
        compressible: true
      },
      "application/lpf+zip": {
        source: "iana",
        compressible: false
      },
      "application/lxf": {
        source: "iana"
      },
      "application/mac-binhex40": {
        source: "iana",
        extensions: ["hqx"]
      },
      "application/mac-compactpro": {
        source: "apache",
        extensions: ["cpt"]
      },
      "application/macwriteii": {
        source: "iana"
      },
      "application/mads+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mads"]
      },
      "application/manifest+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["webmanifest"]
      },
      "application/marc": {
        source: "iana",
        extensions: ["mrc"]
      },
      "application/marcxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mrcx"]
      },
      "application/mathematica": {
        source: "iana",
        extensions: ["ma", "nb", "mb"]
      },
      "application/mathml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mathml"]
      },
      "application/mathml-content+xml": {
        source: "iana",
        compressible: true
      },
      "application/mathml-presentation+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-associated-procedure-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-deregister+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-envelope+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-msk+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-msk-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-protection-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-reception-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-register+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-register-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-schedule+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-user-service-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbox": {
        source: "iana",
        extensions: ["mbox"]
      },
      "application/media-policy-dataset+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpf"]
      },
      "application/media_control+xml": {
        source: "iana",
        compressible: true
      },
      "application/mediaservercontrol+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mscml"]
      },
      "application/merge-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/metalink+xml": {
        source: "apache",
        compressible: true,
        extensions: ["metalink"]
      },
      "application/metalink4+xml": {
        source: "iana",
        compressible: true,
        extensions: ["meta4"]
      },
      "application/mets+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mets"]
      },
      "application/mf4": {
        source: "iana"
      },
      "application/mikey": {
        source: "iana"
      },
      "application/mipc": {
        source: "iana"
      },
      "application/missing-blocks+cbor-seq": {
        source: "iana"
      },
      "application/mmt-aei+xml": {
        source: "iana",
        compressible: true,
        extensions: ["maei"]
      },
      "application/mmt-usd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["musd"]
      },
      "application/mods+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mods"]
      },
      "application/moss-keys": {
        source: "iana"
      },
      "application/moss-signature": {
        source: "iana"
      },
      "application/mosskey-data": {
        source: "iana"
      },
      "application/mosskey-request": {
        source: "iana"
      },
      "application/mp21": {
        source: "iana",
        extensions: ["m21", "mp21"]
      },
      "application/mp4": {
        source: "iana",
        extensions: ["mp4s", "m4p"]
      },
      "application/mpeg4-generic": {
        source: "iana"
      },
      "application/mpeg4-iod": {
        source: "iana"
      },
      "application/mpeg4-iod-xmt": {
        source: "iana"
      },
      "application/mrb-consumer+xml": {
        source: "iana",
        compressible: true
      },
      "application/mrb-publish+xml": {
        source: "iana",
        compressible: true
      },
      "application/msc-ivr+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/msc-mixer+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/msword": {
        source: "iana",
        compressible: false,
        extensions: ["doc", "dot"]
      },
      "application/mud+json": {
        source: "iana",
        compressible: true
      },
      "application/multipart-core": {
        source: "iana"
      },
      "application/mxf": {
        source: "iana",
        extensions: ["mxf"]
      },
      "application/n-quads": {
        source: "iana",
        extensions: ["nq"]
      },
      "application/n-triples": {
        source: "iana",
        extensions: ["nt"]
      },
      "application/nasdata": {
        source: "iana"
      },
      "application/news-checkgroups": {
        source: "iana",
        charset: "US-ASCII"
      },
      "application/news-groupinfo": {
        source: "iana",
        charset: "US-ASCII"
      },
      "application/news-transmission": {
        source: "iana"
      },
      "application/nlsml+xml": {
        source: "iana",
        compressible: true
      },
      "application/node": {
        source: "iana",
        extensions: ["cjs"]
      },
      "application/nss": {
        source: "iana"
      },
      "application/oauth-authz-req+jwt": {
        source: "iana"
      },
      "application/oblivious-dns-message": {
        source: "iana"
      },
      "application/ocsp-request": {
        source: "iana"
      },
      "application/ocsp-response": {
        source: "iana"
      },
      "application/octet-stream": {
        source: "iana",
        compressible: false,
        extensions: ["bin", "dms", "lrf", "mar", "so", "dist", "distz", "pkg", "bpk", "dump", "elc", "deploy", "exe", "dll", "deb", "dmg", "iso", "img", "msi", "msp", "msm", "buffer"]
      },
      "application/oda": {
        source: "iana",
        extensions: ["oda"]
      },
      "application/odm+xml": {
        source: "iana",
        compressible: true
      },
      "application/odx": {
        source: "iana"
      },
      "application/oebps-package+xml": {
        source: "iana",
        compressible: true,
        extensions: ["opf"]
      },
      "application/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["ogx"]
      },
      "application/omdoc+xml": {
        source: "apache",
        compressible: true,
        extensions: ["omdoc"]
      },
      "application/onenote": {
        source: "apache",
        extensions: ["onetoc", "onetoc2", "onetmp", "onepkg"]
      },
      "application/opc-nodeset+xml": {
        source: "iana",
        compressible: true
      },
      "application/oscore": {
        source: "iana"
      },
      "application/oxps": {
        source: "iana",
        extensions: ["oxps"]
      },
      "application/p21": {
        source: "iana"
      },
      "application/p21+zip": {
        source: "iana",
        compressible: false
      },
      "application/p2p-overlay+xml": {
        source: "iana",
        compressible: true,
        extensions: ["relo"]
      },
      "application/parityfec": {
        source: "iana"
      },
      "application/passport": {
        source: "iana"
      },
      "application/patch-ops-error+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xer"]
      },
      "application/pdf": {
        source: "iana",
        compressible: false,
        extensions: ["pdf"]
      },
      "application/pdx": {
        source: "iana"
      },
      "application/pem-certificate-chain": {
        source: "iana"
      },
      "application/pgp-encrypted": {
        source: "iana",
        compressible: false,
        extensions: ["pgp"]
      },
      "application/pgp-keys": {
        source: "iana",
        extensions: ["asc"]
      },
      "application/pgp-signature": {
        source: "iana",
        extensions: ["asc", "sig"]
      },
      "application/pics-rules": {
        source: "apache",
        extensions: ["prf"]
      },
      "application/pidf+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/pidf-diff+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/pkcs10": {
        source: "iana",
        extensions: ["p10"]
      },
      "application/pkcs12": {
        source: "iana"
      },
      "application/pkcs7-mime": {
        source: "iana",
        extensions: ["p7m", "p7c"]
      },
      "application/pkcs7-signature": {
        source: "iana",
        extensions: ["p7s"]
      },
      "application/pkcs8": {
        source: "iana",
        extensions: ["p8"]
      },
      "application/pkcs8-encrypted": {
        source: "iana"
      },
      "application/pkix-attr-cert": {
        source: "iana",
        extensions: ["ac"]
      },
      "application/pkix-cert": {
        source: "iana",
        extensions: ["cer"]
      },
      "application/pkix-crl": {
        source: "iana",
        extensions: ["crl"]
      },
      "application/pkix-pkipath": {
        source: "iana",
        extensions: ["pkipath"]
      },
      "application/pkixcmp": {
        source: "iana",
        extensions: ["pki"]
      },
      "application/pls+xml": {
        source: "iana",
        compressible: true,
        extensions: ["pls"]
      },
      "application/poc-settings+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/postscript": {
        source: "iana",
        compressible: true,
        extensions: ["ai", "eps", "ps"]
      },
      "application/ppsp-tracker+json": {
        source: "iana",
        compressible: true
      },
      "application/problem+json": {
        source: "iana",
        compressible: true
      },
      "application/problem+xml": {
        source: "iana",
        compressible: true
      },
      "application/provenance+xml": {
        source: "iana",
        compressible: true,
        extensions: ["provx"]
      },
      "application/prs.alvestrand.titrax-sheet": {
        source: "iana"
      },
      "application/prs.cww": {
        source: "iana",
        extensions: ["cww"]
      },
      "application/prs.cyn": {
        source: "iana",
        charset: "7-BIT"
      },
      "application/prs.hpub+zip": {
        source: "iana",
        compressible: false
      },
      "application/prs.nprend": {
        source: "iana"
      },
      "application/prs.plucker": {
        source: "iana"
      },
      "application/prs.rdf-xml-crypt": {
        source: "iana"
      },
      "application/prs.xsf+xml": {
        source: "iana",
        compressible: true
      },
      "application/pskc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["pskcxml"]
      },
      "application/pvd+json": {
        source: "iana",
        compressible: true
      },
      "application/qsig": {
        source: "iana"
      },
      "application/raml+yaml": {
        compressible: true,
        extensions: ["raml"]
      },
      "application/raptorfec": {
        source: "iana"
      },
      "application/rdap+json": {
        source: "iana",
        compressible: true
      },
      "application/rdf+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rdf", "owl"]
      },
      "application/reginfo+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rif"]
      },
      "application/relax-ng-compact-syntax": {
        source: "iana",
        extensions: ["rnc"]
      },
      "application/remote-printing": {
        source: "iana"
      },
      "application/reputon+json": {
        source: "iana",
        compressible: true
      },
      "application/resource-lists+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rl"]
      },
      "application/resource-lists-diff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rld"]
      },
      "application/rfc+xml": {
        source: "iana",
        compressible: true
      },
      "application/riscos": {
        source: "iana"
      },
      "application/rlmi+xml": {
        source: "iana",
        compressible: true
      },
      "application/rls-services+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rs"]
      },
      "application/route-apd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rapd"]
      },
      "application/route-s-tsid+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sls"]
      },
      "application/route-usd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rusd"]
      },
      "application/rpki-ghostbusters": {
        source: "iana",
        extensions: ["gbr"]
      },
      "application/rpki-manifest": {
        source: "iana",
        extensions: ["mft"]
      },
      "application/rpki-publication": {
        source: "iana"
      },
      "application/rpki-roa": {
        source: "iana",
        extensions: ["roa"]
      },
      "application/rpki-updown": {
        source: "iana"
      },
      "application/rsd+xml": {
        source: "apache",
        compressible: true,
        extensions: ["rsd"]
      },
      "application/rss+xml": {
        source: "apache",
        compressible: true,
        extensions: ["rss"]
      },
      "application/rtf": {
        source: "iana",
        compressible: true,
        extensions: ["rtf"]
      },
      "application/rtploopback": {
        source: "iana"
      },
      "application/rtx": {
        source: "iana"
      },
      "application/samlassertion+xml": {
        source: "iana",
        compressible: true
      },
      "application/samlmetadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/sarif+json": {
        source: "iana",
        compressible: true
      },
      "application/sarif-external-properties+json": {
        source: "iana",
        compressible: true
      },
      "application/sbe": {
        source: "iana"
      },
      "application/sbml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sbml"]
      },
      "application/scaip+xml": {
        source: "iana",
        compressible: true
      },
      "application/scim+json": {
        source: "iana",
        compressible: true
      },
      "application/scvp-cv-request": {
        source: "iana",
        extensions: ["scq"]
      },
      "application/scvp-cv-response": {
        source: "iana",
        extensions: ["scs"]
      },
      "application/scvp-vp-request": {
        source: "iana",
        extensions: ["spq"]
      },
      "application/scvp-vp-response": {
        source: "iana",
        extensions: ["spp"]
      },
      "application/sdp": {
        source: "iana",
        extensions: ["sdp"]
      },
      "application/secevent+jwt": {
        source: "iana"
      },
      "application/senml+cbor": {
        source: "iana"
      },
      "application/senml+json": {
        source: "iana",
        compressible: true
      },
      "application/senml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["senmlx"]
      },
      "application/senml-etch+cbor": {
        source: "iana"
      },
      "application/senml-etch+json": {
        source: "iana",
        compressible: true
      },
      "application/senml-exi": {
        source: "iana"
      },
      "application/sensml+cbor": {
        source: "iana"
      },
      "application/sensml+json": {
        source: "iana",
        compressible: true
      },
      "application/sensml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sensmlx"]
      },
      "application/sensml-exi": {
        source: "iana"
      },
      "application/sep+xml": {
        source: "iana",
        compressible: true
      },
      "application/sep-exi": {
        source: "iana"
      },
      "application/session-info": {
        source: "iana"
      },
      "application/set-payment": {
        source: "iana"
      },
      "application/set-payment-initiation": {
        source: "iana",
        extensions: ["setpay"]
      },
      "application/set-registration": {
        source: "iana"
      },
      "application/set-registration-initiation": {
        source: "iana",
        extensions: ["setreg"]
      },
      "application/sgml": {
        source: "iana"
      },
      "application/sgml-open-catalog": {
        source: "iana"
      },
      "application/shf+xml": {
        source: "iana",
        compressible: true,
        extensions: ["shf"]
      },
      "application/sieve": {
        source: "iana",
        extensions: ["siv", "sieve"]
      },
      "application/simple-filter+xml": {
        source: "iana",
        compressible: true
      },
      "application/simple-message-summary": {
        source: "iana"
      },
      "application/simplesymbolcontainer": {
        source: "iana"
      },
      "application/sipc": {
        source: "iana"
      },
      "application/slate": {
        source: "iana"
      },
      "application/smil": {
        source: "iana"
      },
      "application/smil+xml": {
        source: "iana",
        compressible: true,
        extensions: ["smi", "smil"]
      },
      "application/smpte336m": {
        source: "iana"
      },
      "application/soap+fastinfoset": {
        source: "iana"
      },
      "application/soap+xml": {
        source: "iana",
        compressible: true
      },
      "application/sparql-query": {
        source: "iana",
        extensions: ["rq"]
      },
      "application/sparql-results+xml": {
        source: "iana",
        compressible: true,
        extensions: ["srx"]
      },
      "application/spdx+json": {
        source: "iana",
        compressible: true
      },
      "application/spirits-event+xml": {
        source: "iana",
        compressible: true
      },
      "application/sql": {
        source: "iana"
      },
      "application/srgs": {
        source: "iana",
        extensions: ["gram"]
      },
      "application/srgs+xml": {
        source: "iana",
        compressible: true,
        extensions: ["grxml"]
      },
      "application/sru+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sru"]
      },
      "application/ssdl+xml": {
        source: "apache",
        compressible: true,
        extensions: ["ssdl"]
      },
      "application/ssml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ssml"]
      },
      "application/stix+json": {
        source: "iana",
        compressible: true
      },
      "application/swid+xml": {
        source: "iana",
        compressible: true,
        extensions: ["swidtag"]
      },
      "application/tamp-apex-update": {
        source: "iana"
      },
      "application/tamp-apex-update-confirm": {
        source: "iana"
      },
      "application/tamp-community-update": {
        source: "iana"
      },
      "application/tamp-community-update-confirm": {
        source: "iana"
      },
      "application/tamp-error": {
        source: "iana"
      },
      "application/tamp-sequence-adjust": {
        source: "iana"
      },
      "application/tamp-sequence-adjust-confirm": {
        source: "iana"
      },
      "application/tamp-status-query": {
        source: "iana"
      },
      "application/tamp-status-response": {
        source: "iana"
      },
      "application/tamp-update": {
        source: "iana"
      },
      "application/tamp-update-confirm": {
        source: "iana"
      },
      "application/tar": {
        compressible: true
      },
      "application/taxii+json": {
        source: "iana",
        compressible: true
      },
      "application/td+json": {
        source: "iana",
        compressible: true
      },
      "application/tei+xml": {
        source: "iana",
        compressible: true,
        extensions: ["tei", "teicorpus"]
      },
      "application/tetra_isi": {
        source: "iana"
      },
      "application/thraud+xml": {
        source: "iana",
        compressible: true,
        extensions: ["tfi"]
      },
      "application/timestamp-query": {
        source: "iana"
      },
      "application/timestamp-reply": {
        source: "iana"
      },
      "application/timestamped-data": {
        source: "iana",
        extensions: ["tsd"]
      },
      "application/tlsrpt+gzip": {
        source: "iana"
      },
      "application/tlsrpt+json": {
        source: "iana",
        compressible: true
      },
      "application/tnauthlist": {
        source: "iana"
      },
      "application/token-introspection+jwt": {
        source: "iana"
      },
      "application/toml": {
        compressible: true,
        extensions: ["toml"]
      },
      "application/trickle-ice-sdpfrag": {
        source: "iana"
      },
      "application/trig": {
        source: "iana",
        extensions: ["trig"]
      },
      "application/ttml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ttml"]
      },
      "application/tve-trigger": {
        source: "iana"
      },
      "application/tzif": {
        source: "iana"
      },
      "application/tzif-leap": {
        source: "iana"
      },
      "application/ubjson": {
        compressible: false,
        extensions: ["ubj"]
      },
      "application/ulpfec": {
        source: "iana"
      },
      "application/urc-grpsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/urc-ressheet+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rsheet"]
      },
      "application/urc-targetdesc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["td"]
      },
      "application/urc-uisocketdesc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vcard+json": {
        source: "iana",
        compressible: true
      },
      "application/vcard+xml": {
        source: "iana",
        compressible: true
      },
      "application/vemmi": {
        source: "iana"
      },
      "application/vividence.scriptfile": {
        source: "apache"
      },
      "application/vnd.1000minds.decision-model+xml": {
        source: "iana",
        compressible: true,
        extensions: ["1km"]
      },
      "application/vnd.3gpp-prose+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp-prose-pc3ch+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp-v2x-local-service-information": {
        source: "iana"
      },
      "application/vnd.3gpp.5gnas": {
        source: "iana"
      },
      "application/vnd.3gpp.access-transfer-events+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.bsf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.gmop+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.gtpc": {
        source: "iana"
      },
      "application/vnd.3gpp.interworking-data": {
        source: "iana"
      },
      "application/vnd.3gpp.lpp": {
        source: "iana"
      },
      "application/vnd.3gpp.mc-signalling-ear": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-payload": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-signalling": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-floor-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-location-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-mbms-usage-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-signed+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-ue-init-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-affiliation-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-location-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-transmission-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mid-call+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.ngap": {
        source: "iana"
      },
      "application/vnd.3gpp.pfcp": {
        source: "iana"
      },
      "application/vnd.3gpp.pic-bw-large": {
        source: "iana",
        extensions: ["plb"]
      },
      "application/vnd.3gpp.pic-bw-small": {
        source: "iana",
        extensions: ["psb"]
      },
      "application/vnd.3gpp.pic-bw-var": {
        source: "iana",
        extensions: ["pvb"]
      },
      "application/vnd.3gpp.s1ap": {
        source: "iana"
      },
      "application/vnd.3gpp.sms": {
        source: "iana"
      },
      "application/vnd.3gpp.sms+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.srvcc-ext+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.srvcc-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.state-and-event-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.ussd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp2.bcmcsinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp2.sms": {
        source: "iana"
      },
      "application/vnd.3gpp2.tcap": {
        source: "iana",
        extensions: ["tcap"]
      },
      "application/vnd.3lightssoftware.imagescal": {
        source: "iana"
      },
      "application/vnd.3m.post-it-notes": {
        source: "iana",
        extensions: ["pwn"]
      },
      "application/vnd.accpac.simply.aso": {
        source: "iana",
        extensions: ["aso"]
      },
      "application/vnd.accpac.simply.imp": {
        source: "iana",
        extensions: ["imp"]
      },
      "application/vnd.acucobol": {
        source: "iana",
        extensions: ["acu"]
      },
      "application/vnd.acucorp": {
        source: "iana",
        extensions: ["atc", "acutc"]
      },
      "application/vnd.adobe.air-application-installer-package+zip": {
        source: "apache",
        compressible: false,
        extensions: ["air"]
      },
      "application/vnd.adobe.flash.movie": {
        source: "iana"
      },
      "application/vnd.adobe.formscentral.fcdt": {
        source: "iana",
        extensions: ["fcdt"]
      },
      "application/vnd.adobe.fxp": {
        source: "iana",
        extensions: ["fxp", "fxpl"]
      },
      "application/vnd.adobe.partial-upload": {
        source: "iana"
      },
      "application/vnd.adobe.xdp+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdp"]
      },
      "application/vnd.adobe.xfdf": {
        source: "iana",
        extensions: ["xfdf"]
      },
      "application/vnd.aether.imp": {
        source: "iana"
      },
      "application/vnd.afpc.afplinedata": {
        source: "iana"
      },
      "application/vnd.afpc.afplinedata-pagedef": {
        source: "iana"
      },
      "application/vnd.afpc.cmoca-cmresource": {
        source: "iana"
      },
      "application/vnd.afpc.foca-charset": {
        source: "iana"
      },
      "application/vnd.afpc.foca-codedfont": {
        source: "iana"
      },
      "application/vnd.afpc.foca-codepage": {
        source: "iana"
      },
      "application/vnd.afpc.modca": {
        source: "iana"
      },
      "application/vnd.afpc.modca-cmtable": {
        source: "iana"
      },
      "application/vnd.afpc.modca-formdef": {
        source: "iana"
      },
      "application/vnd.afpc.modca-mediummap": {
        source: "iana"
      },
      "application/vnd.afpc.modca-objectcontainer": {
        source: "iana"
      },
      "application/vnd.afpc.modca-overlay": {
        source: "iana"
      },
      "application/vnd.afpc.modca-pagesegment": {
        source: "iana"
      },
      "application/vnd.age": {
        source: "iana",
        extensions: ["age"]
      },
      "application/vnd.ah-barcode": {
        source: "iana"
      },
      "application/vnd.ahead.space": {
        source: "iana",
        extensions: ["ahead"]
      },
      "application/vnd.airzip.filesecure.azf": {
        source: "iana",
        extensions: ["azf"]
      },
      "application/vnd.airzip.filesecure.azs": {
        source: "iana",
        extensions: ["azs"]
      },
      "application/vnd.amadeus+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.amazon.ebook": {
        source: "apache",
        extensions: ["azw"]
      },
      "application/vnd.amazon.mobi8-ebook": {
        source: "iana"
      },
      "application/vnd.americandynamics.acc": {
        source: "iana",
        extensions: ["acc"]
      },
      "application/vnd.amiga.ami": {
        source: "iana",
        extensions: ["ami"]
      },
      "application/vnd.amundsen.maze+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.android.ota": {
        source: "iana"
      },
      "application/vnd.android.package-archive": {
        source: "apache",
        compressible: false,
        extensions: ["apk"]
      },
      "application/vnd.anki": {
        source: "iana"
      },
      "application/vnd.anser-web-certificate-issue-initiation": {
        source: "iana",
        extensions: ["cii"]
      },
      "application/vnd.anser-web-funds-transfer-initiation": {
        source: "apache",
        extensions: ["fti"]
      },
      "application/vnd.antix.game-component": {
        source: "iana",
        extensions: ["atx"]
      },
      "application/vnd.apache.arrow.file": {
        source: "iana"
      },
      "application/vnd.apache.arrow.stream": {
        source: "iana"
      },
      "application/vnd.apache.thrift.binary": {
        source: "iana"
      },
      "application/vnd.apache.thrift.compact": {
        source: "iana"
      },
      "application/vnd.apache.thrift.json": {
        source: "iana"
      },
      "application/vnd.api+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.aplextor.warrp+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.apothekende.reservation+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.apple.installer+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpkg"]
      },
      "application/vnd.apple.keynote": {
        source: "iana",
        extensions: ["key"]
      },
      "application/vnd.apple.mpegurl": {
        source: "iana",
        extensions: ["m3u8"]
      },
      "application/vnd.apple.numbers": {
        source: "iana",
        extensions: ["numbers"]
      },
      "application/vnd.apple.pages": {
        source: "iana",
        extensions: ["pages"]
      },
      "application/vnd.apple.pkpass": {
        compressible: false,
        extensions: ["pkpass"]
      },
      "application/vnd.arastra.swi": {
        source: "iana"
      },
      "application/vnd.aristanetworks.swi": {
        source: "iana",
        extensions: ["swi"]
      },
      "application/vnd.artisan+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.artsquare": {
        source: "iana"
      },
      "application/vnd.astraea-software.iota": {
        source: "iana",
        extensions: ["iota"]
      },
      "application/vnd.audiograph": {
        source: "iana",
        extensions: ["aep"]
      },
      "application/vnd.autopackage": {
        source: "iana"
      },
      "application/vnd.avalon+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.avistar+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.balsamiq.bmml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["bmml"]
      },
      "application/vnd.balsamiq.bmpr": {
        source: "iana"
      },
      "application/vnd.banana-accounting": {
        source: "iana"
      },
      "application/vnd.bbf.usp.error": {
        source: "iana"
      },
      "application/vnd.bbf.usp.msg": {
        source: "iana"
      },
      "application/vnd.bbf.usp.msg+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.bekitzur-stech+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.bint.med-content": {
        source: "iana"
      },
      "application/vnd.biopax.rdf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.blink-idb-value-wrapper": {
        source: "iana"
      },
      "application/vnd.blueice.multipass": {
        source: "iana",
        extensions: ["mpm"]
      },
      "application/vnd.bluetooth.ep.oob": {
        source: "iana"
      },
      "application/vnd.bluetooth.le.oob": {
        source: "iana"
      },
      "application/vnd.bmi": {
        source: "iana",
        extensions: ["bmi"]
      },
      "application/vnd.bpf": {
        source: "iana"
      },
      "application/vnd.bpf3": {
        source: "iana"
      },
      "application/vnd.businessobjects": {
        source: "iana",
        extensions: ["rep"]
      },
      "application/vnd.byu.uapi+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cab-jscript": {
        source: "iana"
      },
      "application/vnd.canon-cpdl": {
        source: "iana"
      },
      "application/vnd.canon-lips": {
        source: "iana"
      },
      "application/vnd.capasystems-pg+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cendio.thinlinc.clientconf": {
        source: "iana"
      },
      "application/vnd.century-systems.tcp_stream": {
        source: "iana"
      },
      "application/vnd.chemdraw+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cdxml"]
      },
      "application/vnd.chess-pgn": {
        source: "iana"
      },
      "application/vnd.chipnuts.karaoke-mmd": {
        source: "iana",
        extensions: ["mmd"]
      },
      "application/vnd.ciedi": {
        source: "iana"
      },
      "application/vnd.cinderella": {
        source: "iana",
        extensions: ["cdy"]
      },
      "application/vnd.cirpack.isdn-ext": {
        source: "iana"
      },
      "application/vnd.citationstyles.style+xml": {
        source: "iana",
        compressible: true,
        extensions: ["csl"]
      },
      "application/vnd.claymore": {
        source: "iana",
        extensions: ["cla"]
      },
      "application/vnd.cloanto.rp9": {
        source: "iana",
        extensions: ["rp9"]
      },
      "application/vnd.clonk.c4group": {
        source: "iana",
        extensions: ["c4g", "c4d", "c4f", "c4p", "c4u"]
      },
      "application/vnd.cluetrust.cartomobile-config": {
        source: "iana",
        extensions: ["c11amc"]
      },
      "application/vnd.cluetrust.cartomobile-config-pkg": {
        source: "iana",
        extensions: ["c11amz"]
      },
      "application/vnd.coffeescript": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.document": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.document-template": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.presentation": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.presentation-template": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.spreadsheet": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.spreadsheet-template": {
        source: "iana"
      },
      "application/vnd.collection+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.collection.doc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.collection.next+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.comicbook+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.comicbook-rar": {
        source: "iana"
      },
      "application/vnd.commerce-battelle": {
        source: "iana"
      },
      "application/vnd.commonspace": {
        source: "iana",
        extensions: ["csp"]
      },
      "application/vnd.contact.cmsg": {
        source: "iana",
        extensions: ["cdbcmsg"]
      },
      "application/vnd.coreos.ignition+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cosmocaller": {
        source: "iana",
        extensions: ["cmc"]
      },
      "application/vnd.crick.clicker": {
        source: "iana",
        extensions: ["clkx"]
      },
      "application/vnd.crick.clicker.keyboard": {
        source: "iana",
        extensions: ["clkk"]
      },
      "application/vnd.crick.clicker.palette": {
        source: "iana",
        extensions: ["clkp"]
      },
      "application/vnd.crick.clicker.template": {
        source: "iana",
        extensions: ["clkt"]
      },
      "application/vnd.crick.clicker.wordbank": {
        source: "iana",
        extensions: ["clkw"]
      },
      "application/vnd.criticaltools.wbs+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wbs"]
      },
      "application/vnd.cryptii.pipe+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.crypto-shade-file": {
        source: "iana"
      },
      "application/vnd.cryptomator.encrypted": {
        source: "iana"
      },
      "application/vnd.cryptomator.vault": {
        source: "iana"
      },
      "application/vnd.ctc-posml": {
        source: "iana",
        extensions: ["pml"]
      },
      "application/vnd.ctct.ws+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cups-pdf": {
        source: "iana"
      },
      "application/vnd.cups-postscript": {
        source: "iana"
      },
      "application/vnd.cups-ppd": {
        source: "iana",
        extensions: ["ppd"]
      },
      "application/vnd.cups-raster": {
        source: "iana"
      },
      "application/vnd.cups-raw": {
        source: "iana"
      },
      "application/vnd.curl": {
        source: "iana"
      },
      "application/vnd.curl.car": {
        source: "apache",
        extensions: ["car"]
      },
      "application/vnd.curl.pcurl": {
        source: "apache",
        extensions: ["pcurl"]
      },
      "application/vnd.cyan.dean.root+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cybank": {
        source: "iana"
      },
      "application/vnd.cyclonedx+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cyclonedx+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.d2l.coursepackage1p0+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.d3m-dataset": {
        source: "iana"
      },
      "application/vnd.d3m-problem": {
        source: "iana"
      },
      "application/vnd.dart": {
        source: "iana",
        compressible: true,
        extensions: ["dart"]
      },
      "application/vnd.data-vision.rdz": {
        source: "iana",
        extensions: ["rdz"]
      },
      "application/vnd.datapackage+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dataresource+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dbf": {
        source: "iana",
        extensions: ["dbf"]
      },
      "application/vnd.debian.binary-package": {
        source: "iana"
      },
      "application/vnd.dece.data": {
        source: "iana",
        extensions: ["uvf", "uvvf", "uvd", "uvvd"]
      },
      "application/vnd.dece.ttml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["uvt", "uvvt"]
      },
      "application/vnd.dece.unspecified": {
        source: "iana",
        extensions: ["uvx", "uvvx"]
      },
      "application/vnd.dece.zip": {
        source: "iana",
        extensions: ["uvz", "uvvz"]
      },
      "application/vnd.denovo.fcselayout-link": {
        source: "iana",
        extensions: ["fe_launch"]
      },
      "application/vnd.desmume.movie": {
        source: "iana"
      },
      "application/vnd.dir-bi.plate-dl-nosuffix": {
        source: "iana"
      },
      "application/vnd.dm.delegation+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dna": {
        source: "iana",
        extensions: ["dna"]
      },
      "application/vnd.document+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dolby.mlp": {
        source: "apache",
        extensions: ["mlp"]
      },
      "application/vnd.dolby.mobile.1": {
        source: "iana"
      },
      "application/vnd.dolby.mobile.2": {
        source: "iana"
      },
      "application/vnd.doremir.scorecloud-binary-document": {
        source: "iana"
      },
      "application/vnd.dpgraph": {
        source: "iana",
        extensions: ["dpg"]
      },
      "application/vnd.dreamfactory": {
        source: "iana",
        extensions: ["dfac"]
      },
      "application/vnd.drive+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ds-keypoint": {
        source: "apache",
        extensions: ["kpxx"]
      },
      "application/vnd.dtg.local": {
        source: "iana"
      },
      "application/vnd.dtg.local.flash": {
        source: "iana"
      },
      "application/vnd.dtg.local.html": {
        source: "iana"
      },
      "application/vnd.dvb.ait": {
        source: "iana",
        extensions: ["ait"]
      },
      "application/vnd.dvb.dvbisl+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.dvbj": {
        source: "iana"
      },
      "application/vnd.dvb.esgcontainer": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcdftnotifaccess": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgaccess": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgaccess2": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgpdd": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcroaming": {
        source: "iana"
      },
      "application/vnd.dvb.iptv.alfec-base": {
        source: "iana"
      },
      "application/vnd.dvb.iptv.alfec-enhancement": {
        source: "iana"
      },
      "application/vnd.dvb.notif-aggregate-root+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-container+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-generic+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-msglist+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-registration-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-registration-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-init+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.pfr": {
        source: "iana"
      },
      "application/vnd.dvb.service": {
        source: "iana",
        extensions: ["svc"]
      },
      "application/vnd.dxr": {
        source: "iana"
      },
      "application/vnd.dynageo": {
        source: "iana",
        extensions: ["geo"]
      },
      "application/vnd.dzr": {
        source: "iana"
      },
      "application/vnd.easykaraoke.cdgdownload": {
        source: "iana"
      },
      "application/vnd.ecdis-update": {
        source: "iana"
      },
      "application/vnd.ecip.rlp": {
        source: "iana"
      },
      "application/vnd.eclipse.ditto+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ecowin.chart": {
        source: "iana",
        extensions: ["mag"]
      },
      "application/vnd.ecowin.filerequest": {
        source: "iana"
      },
      "application/vnd.ecowin.fileupdate": {
        source: "iana"
      },
      "application/vnd.ecowin.series": {
        source: "iana"
      },
      "application/vnd.ecowin.seriesrequest": {
        source: "iana"
      },
      "application/vnd.ecowin.seriesupdate": {
        source: "iana"
      },
      "application/vnd.efi.img": {
        source: "iana"
      },
      "application/vnd.efi.iso": {
        source: "iana"
      },
      "application/vnd.emclient.accessrequest+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.enliven": {
        source: "iana",
        extensions: ["nml"]
      },
      "application/vnd.enphase.envoy": {
        source: "iana"
      },
      "application/vnd.eprints.data+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.epson.esf": {
        source: "iana",
        extensions: ["esf"]
      },
      "application/vnd.epson.msf": {
        source: "iana",
        extensions: ["msf"]
      },
      "application/vnd.epson.quickanime": {
        source: "iana",
        extensions: ["qam"]
      },
      "application/vnd.epson.salt": {
        source: "iana",
        extensions: ["slt"]
      },
      "application/vnd.epson.ssf": {
        source: "iana",
        extensions: ["ssf"]
      },
      "application/vnd.ericsson.quickcall": {
        source: "iana"
      },
      "application/vnd.espass-espass+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.eszigno3+xml": {
        source: "iana",
        compressible: true,
        extensions: ["es3", "et3"]
      },
      "application/vnd.etsi.aoc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.asic-e+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.etsi.asic-s+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.etsi.cug+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvcommand+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvdiscovery+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-bc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-cod+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-npvr+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvservice+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsync+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvueprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.mcid+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.mheg5": {
        source: "iana"
      },
      "application/vnd.etsi.overload-control-policy-dataset+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.pstn+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.sci+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.simservs+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.timestamp-token": {
        source: "iana"
      },
      "application/vnd.etsi.tsl+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.tsl.der": {
        source: "iana"
      },
      "application/vnd.eu.kasparian.car+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.eudora.data": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.profile": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.settings": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.theme": {
        source: "iana"
      },
      "application/vnd.exstream-empower+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.exstream-package": {
        source: "iana"
      },
      "application/vnd.ezpix-album": {
        source: "iana",
        extensions: ["ez2"]
      },
      "application/vnd.ezpix-package": {
        source: "iana",
        extensions: ["ez3"]
      },
      "application/vnd.f-secure.mobile": {
        source: "iana"
      },
      "application/vnd.familysearch.gedcom+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.fastcopy-disk-image": {
        source: "iana"
      },
      "application/vnd.fdf": {
        source: "iana",
        extensions: ["fdf"]
      },
      "application/vnd.fdsn.mseed": {
        source: "iana",
        extensions: ["mseed"]
      },
      "application/vnd.fdsn.seed": {
        source: "iana",
        extensions: ["seed", "dataless"]
      },
      "application/vnd.ffsns": {
        source: "iana"
      },
      "application/vnd.ficlab.flb+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.filmit.zfc": {
        source: "iana"
      },
      "application/vnd.fints": {
        source: "iana"
      },
      "application/vnd.firemonkeys.cloudcell": {
        source: "iana"
      },
      "application/vnd.flographit": {
        source: "iana",
        extensions: ["gph"]
      },
      "application/vnd.fluxtime.clip": {
        source: "iana",
        extensions: ["ftc"]
      },
      "application/vnd.font-fontforge-sfd": {
        source: "iana"
      },
      "application/vnd.framemaker": {
        source: "iana",
        extensions: ["fm", "frame", "maker", "book"]
      },
      "application/vnd.frogans.fnc": {
        source: "iana",
        extensions: ["fnc"]
      },
      "application/vnd.frogans.ltf": {
        source: "iana",
        extensions: ["ltf"]
      },
      "application/vnd.fsc.weblaunch": {
        source: "iana",
        extensions: ["fsc"]
      },
      "application/vnd.fujifilm.fb.docuworks": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.docuworks.binder": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.docuworks.container": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.jfi+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.fujitsu.oasys": {
        source: "iana",
        extensions: ["oas"]
      },
      "application/vnd.fujitsu.oasys2": {
        source: "iana",
        extensions: ["oa2"]
      },
      "application/vnd.fujitsu.oasys3": {
        source: "iana",
        extensions: ["oa3"]
      },
      "application/vnd.fujitsu.oasysgp": {
        source: "iana",
        extensions: ["fg5"]
      },
      "application/vnd.fujitsu.oasysprs": {
        source: "iana",
        extensions: ["bh2"]
      },
      "application/vnd.fujixerox.art-ex": {
        source: "iana"
      },
      "application/vnd.fujixerox.art4": {
        source: "iana"
      },
      "application/vnd.fujixerox.ddd": {
        source: "iana",
        extensions: ["ddd"]
      },
      "application/vnd.fujixerox.docuworks": {
        source: "iana",
        extensions: ["xdw"]
      },
      "application/vnd.fujixerox.docuworks.binder": {
        source: "iana",
        extensions: ["xbd"]
      },
      "application/vnd.fujixerox.docuworks.container": {
        source: "iana"
      },
      "application/vnd.fujixerox.hbpl": {
        source: "iana"
      },
      "application/vnd.fut-misnet": {
        source: "iana"
      },
      "application/vnd.futoin+cbor": {
        source: "iana"
      },
      "application/vnd.futoin+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.fuzzysheet": {
        source: "iana",
        extensions: ["fzs"]
      },
      "application/vnd.genomatix.tuxedo": {
        source: "iana",
        extensions: ["txd"]
      },
      "application/vnd.gentics.grd+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geo+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geocube+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geogebra.file": {
        source: "iana",
        extensions: ["ggb"]
      },
      "application/vnd.geogebra.slides": {
        source: "iana"
      },
      "application/vnd.geogebra.tool": {
        source: "iana",
        extensions: ["ggt"]
      },
      "application/vnd.geometry-explorer": {
        source: "iana",
        extensions: ["gex", "gre"]
      },
      "application/vnd.geonext": {
        source: "iana",
        extensions: ["gxt"]
      },
      "application/vnd.geoplan": {
        source: "iana",
        extensions: ["g2w"]
      },
      "application/vnd.geospace": {
        source: "iana",
        extensions: ["g3w"]
      },
      "application/vnd.gerber": {
        source: "iana"
      },
      "application/vnd.globalplatform.card-content-mgt": {
        source: "iana"
      },
      "application/vnd.globalplatform.card-content-mgt-response": {
        source: "iana"
      },
      "application/vnd.gmx": {
        source: "iana",
        extensions: ["gmx"]
      },
      "application/vnd.google-apps.document": {
        compressible: false,
        extensions: ["gdoc"]
      },
      "application/vnd.google-apps.presentation": {
        compressible: false,
        extensions: ["gslides"]
      },
      "application/vnd.google-apps.spreadsheet": {
        compressible: false,
        extensions: ["gsheet"]
      },
      "application/vnd.google-earth.kml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["kml"]
      },
      "application/vnd.google-earth.kmz": {
        source: "iana",
        compressible: false,
        extensions: ["kmz"]
      },
      "application/vnd.gov.sk.e-form+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.gov.sk.e-form+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.gov.sk.xmldatacontainer+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.grafeq": {
        source: "iana",
        extensions: ["gqf", "gqs"]
      },
      "application/vnd.gridmp": {
        source: "iana"
      },
      "application/vnd.groove-account": {
        source: "iana",
        extensions: ["gac"]
      },
      "application/vnd.groove-help": {
        source: "iana",
        extensions: ["ghf"]
      },
      "application/vnd.groove-identity-message": {
        source: "iana",
        extensions: ["gim"]
      },
      "application/vnd.groove-injector": {
        source: "iana",
        extensions: ["grv"]
      },
      "application/vnd.groove-tool-message": {
        source: "iana",
        extensions: ["gtm"]
      },
      "application/vnd.groove-tool-template": {
        source: "iana",
        extensions: ["tpl"]
      },
      "application/vnd.groove-vcard": {
        source: "iana",
        extensions: ["vcg"]
      },
      "application/vnd.hal+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hal+xml": {
        source: "iana",
        compressible: true,
        extensions: ["hal"]
      },
      "application/vnd.handheld-entertainment+xml": {
        source: "iana",
        compressible: true,
        extensions: ["zmm"]
      },
      "application/vnd.hbci": {
        source: "iana",
        extensions: ["hbci"]
      },
      "application/vnd.hc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hcl-bireports": {
        source: "iana"
      },
      "application/vnd.hdt": {
        source: "iana"
      },
      "application/vnd.heroku+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hhe.lesson-player": {
        source: "iana",
        extensions: ["les"]
      },
      "application/vnd.hl7cda+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.hl7v2+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.hp-hpgl": {
        source: "iana",
        extensions: ["hpgl"]
      },
      "application/vnd.hp-hpid": {
        source: "iana",
        extensions: ["hpid"]
      },
      "application/vnd.hp-hps": {
        source: "iana",
        extensions: ["hps"]
      },
      "application/vnd.hp-jlyt": {
        source: "iana",
        extensions: ["jlt"]
      },
      "application/vnd.hp-pcl": {
        source: "iana",
        extensions: ["pcl"]
      },
      "application/vnd.hp-pclxl": {
        source: "iana",
        extensions: ["pclxl"]
      },
      "application/vnd.httphone": {
        source: "iana"
      },
      "application/vnd.hydrostatix.sof-data": {
        source: "iana",
        extensions: ["sfd-hdstx"]
      },
      "application/vnd.hyper+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hyper-item+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hyperdrive+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hzn-3d-crossword": {
        source: "iana"
      },
      "application/vnd.ibm.afplinedata": {
        source: "iana"
      },
      "application/vnd.ibm.electronic-media": {
        source: "iana"
      },
      "application/vnd.ibm.minipay": {
        source: "iana",
        extensions: ["mpy"]
      },
      "application/vnd.ibm.modcap": {
        source: "iana",
        extensions: ["afp", "listafp", "list3820"]
      },
      "application/vnd.ibm.rights-management": {
        source: "iana",
        extensions: ["irm"]
      },
      "application/vnd.ibm.secure-container": {
        source: "iana",
        extensions: ["sc"]
      },
      "application/vnd.iccprofile": {
        source: "iana",
        extensions: ["icc", "icm"]
      },
      "application/vnd.ieee.1905": {
        source: "iana"
      },
      "application/vnd.igloader": {
        source: "iana",
        extensions: ["igl"]
      },
      "application/vnd.imagemeter.folder+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.imagemeter.image+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.immervision-ivp": {
        source: "iana",
        extensions: ["ivp"]
      },
      "application/vnd.immervision-ivu": {
        source: "iana",
        extensions: ["ivu"]
      },
      "application/vnd.ims.imsccv1p1": {
        source: "iana"
      },
      "application/vnd.ims.imsccv1p2": {
        source: "iana"
      },
      "application/vnd.ims.imsccv1p3": {
        source: "iana"
      },
      "application/vnd.ims.lis.v2.result+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolconsumerprofile+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolproxy+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolproxy.id+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolsettings+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolsettings.simple+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.informedcontrol.rms+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.informix-visionary": {
        source: "iana"
      },
      "application/vnd.infotech.project": {
        source: "iana"
      },
      "application/vnd.infotech.project+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.innopath.wamp.notification": {
        source: "iana"
      },
      "application/vnd.insors.igm": {
        source: "iana",
        extensions: ["igm"]
      },
      "application/vnd.intercon.formnet": {
        source: "iana",
        extensions: ["xpw", "xpx"]
      },
      "application/vnd.intergeo": {
        source: "iana",
        extensions: ["i2g"]
      },
      "application/vnd.intertrust.digibox": {
        source: "iana"
      },
      "application/vnd.intertrust.nncp": {
        source: "iana"
      },
      "application/vnd.intu.qbo": {
        source: "iana",
        extensions: ["qbo"]
      },
      "application/vnd.intu.qfx": {
        source: "iana",
        extensions: ["qfx"]
      },
      "application/vnd.iptc.g2.catalogitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.conceptitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.knowledgeitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.newsitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.newsmessage+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.packageitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.planningitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ipunplugged.rcprofile": {
        source: "iana",
        extensions: ["rcprofile"]
      },
      "application/vnd.irepository.package+xml": {
        source: "iana",
        compressible: true,
        extensions: ["irp"]
      },
      "application/vnd.is-xpr": {
        source: "iana",
        extensions: ["xpr"]
      },
      "application/vnd.isac.fcs": {
        source: "iana",
        extensions: ["fcs"]
      },
      "application/vnd.iso11783-10+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.jam": {
        source: "iana",
        extensions: ["jam"]
      },
      "application/vnd.japannet-directory-service": {
        source: "iana"
      },
      "application/vnd.japannet-jpnstore-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-payment-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-registration": {
        source: "iana"
      },
      "application/vnd.japannet-registration-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-setstore-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-verification": {
        source: "iana"
      },
      "application/vnd.japannet-verification-wakeup": {
        source: "iana"
      },
      "application/vnd.jcp.javame.midlet-rms": {
        source: "iana",
        extensions: ["rms"]
      },
      "application/vnd.jisp": {
        source: "iana",
        extensions: ["jisp"]
      },
      "application/vnd.joost.joda-archive": {
        source: "iana",
        extensions: ["joda"]
      },
      "application/vnd.jsk.isdn-ngn": {
        source: "iana"
      },
      "application/vnd.kahootz": {
        source: "iana",
        extensions: ["ktz", "ktr"]
      },
      "application/vnd.kde.karbon": {
        source: "iana",
        extensions: ["karbon"]
      },
      "application/vnd.kde.kchart": {
        source: "iana",
        extensions: ["chrt"]
      },
      "application/vnd.kde.kformula": {
        source: "iana",
        extensions: ["kfo"]
      },
      "application/vnd.kde.kivio": {
        source: "iana",
        extensions: ["flw"]
      },
      "application/vnd.kde.kontour": {
        source: "iana",
        extensions: ["kon"]
      },
      "application/vnd.kde.kpresenter": {
        source: "iana",
        extensions: ["kpr", "kpt"]
      },
      "application/vnd.kde.kspread": {
        source: "iana",
        extensions: ["ksp"]
      },
      "application/vnd.kde.kword": {
        source: "iana",
        extensions: ["kwd", "kwt"]
      },
      "application/vnd.kenameaapp": {
        source: "iana",
        extensions: ["htke"]
      },
      "application/vnd.kidspiration": {
        source: "iana",
        extensions: ["kia"]
      },
      "application/vnd.kinar": {
        source: "iana",
        extensions: ["kne", "knp"]
      },
      "application/vnd.koan": {
        source: "iana",
        extensions: ["skp", "skd", "skt", "skm"]
      },
      "application/vnd.kodak-descriptor": {
        source: "iana",
        extensions: ["sse"]
      },
      "application/vnd.las": {
        source: "iana"
      },
      "application/vnd.las.las+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.las.las+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lasxml"]
      },
      "application/vnd.laszip": {
        source: "iana"
      },
      "application/vnd.leap+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.liberty-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.llamagraphics.life-balance.desktop": {
        source: "iana",
        extensions: ["lbd"]
      },
      "application/vnd.llamagraphics.life-balance.exchange+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lbe"]
      },
      "application/vnd.logipipe.circuit+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.loom": {
        source: "iana"
      },
      "application/vnd.lotus-1-2-3": {
        source: "iana",
        extensions: ["123"]
      },
      "application/vnd.lotus-approach": {
        source: "iana",
        extensions: ["apr"]
      },
      "application/vnd.lotus-freelance": {
        source: "iana",
        extensions: ["pre"]
      },
      "application/vnd.lotus-notes": {
        source: "iana",
        extensions: ["nsf"]
      },
      "application/vnd.lotus-organizer": {
        source: "iana",
        extensions: ["org"]
      },
      "application/vnd.lotus-screencam": {
        source: "iana",
        extensions: ["scm"]
      },
      "application/vnd.lotus-wordpro": {
        source: "iana",
        extensions: ["lwp"]
      },
      "application/vnd.macports.portpkg": {
        source: "iana",
        extensions: ["portpkg"]
      },
      "application/vnd.mapbox-vector-tile": {
        source: "iana",
        extensions: ["mvt"]
      },
      "application/vnd.marlin.drm.actiontoken+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.conftoken+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.license+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.mdcf": {
        source: "iana"
      },
      "application/vnd.mason+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.maxar.archive.3tz+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.maxmind.maxmind-db": {
        source: "iana"
      },
      "application/vnd.mcd": {
        source: "iana",
        extensions: ["mcd"]
      },
      "application/vnd.medcalcdata": {
        source: "iana",
        extensions: ["mc1"]
      },
      "application/vnd.mediastation.cdkey": {
        source: "iana",
        extensions: ["cdkey"]
      },
      "application/vnd.meridian-slingshot": {
        source: "iana"
      },
      "application/vnd.mfer": {
        source: "iana",
        extensions: ["mwf"]
      },
      "application/vnd.mfmp": {
        source: "iana",
        extensions: ["mfm"]
      },
      "application/vnd.micro+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.micrografx.flo": {
        source: "iana",
        extensions: ["flo"]
      },
      "application/vnd.micrografx.igx": {
        source: "iana",
        extensions: ["igx"]
      },
      "application/vnd.microsoft.portable-executable": {
        source: "iana"
      },
      "application/vnd.microsoft.windows.thumbnail-cache": {
        source: "iana"
      },
      "application/vnd.miele+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.mif": {
        source: "iana",
        extensions: ["mif"]
      },
      "application/vnd.minisoft-hp3000-save": {
        source: "iana"
      },
      "application/vnd.mitsubishi.misty-guard.trustweb": {
        source: "iana"
      },
      "application/vnd.mobius.daf": {
        source: "iana",
        extensions: ["daf"]
      },
      "application/vnd.mobius.dis": {
        source: "iana",
        extensions: ["dis"]
      },
      "application/vnd.mobius.mbk": {
        source: "iana",
        extensions: ["mbk"]
      },
      "application/vnd.mobius.mqy": {
        source: "iana",
        extensions: ["mqy"]
      },
      "application/vnd.mobius.msl": {
        source: "iana",
        extensions: ["msl"]
      },
      "application/vnd.mobius.plc": {
        source: "iana",
        extensions: ["plc"]
      },
      "application/vnd.mobius.txf": {
        source: "iana",
        extensions: ["txf"]
      },
      "application/vnd.mophun.application": {
        source: "iana",
        extensions: ["mpn"]
      },
      "application/vnd.mophun.certificate": {
        source: "iana",
        extensions: ["mpc"]
      },
      "application/vnd.motorola.flexsuite": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.adsi": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.fis": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.gotap": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.kmr": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.ttc": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.wem": {
        source: "iana"
      },
      "application/vnd.motorola.iprm": {
        source: "iana"
      },
      "application/vnd.mozilla.xul+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xul"]
      },
      "application/vnd.ms-3mfdocument": {
        source: "iana"
      },
      "application/vnd.ms-artgalry": {
        source: "iana",
        extensions: ["cil"]
      },
      "application/vnd.ms-asf": {
        source: "iana"
      },
      "application/vnd.ms-cab-compressed": {
        source: "iana",
        extensions: ["cab"]
      },
      "application/vnd.ms-color.iccprofile": {
        source: "apache"
      },
      "application/vnd.ms-excel": {
        source: "iana",
        compressible: false,
        extensions: ["xls", "xlm", "xla", "xlc", "xlt", "xlw"]
      },
      "application/vnd.ms-excel.addin.macroenabled.12": {
        source: "iana",
        extensions: ["xlam"]
      },
      "application/vnd.ms-excel.sheet.binary.macroenabled.12": {
        source: "iana",
        extensions: ["xlsb"]
      },
      "application/vnd.ms-excel.sheet.macroenabled.12": {
        source: "iana",
        extensions: ["xlsm"]
      },
      "application/vnd.ms-excel.template.macroenabled.12": {
        source: "iana",
        extensions: ["xltm"]
      },
      "application/vnd.ms-fontobject": {
        source: "iana",
        compressible: true,
        extensions: ["eot"]
      },
      "application/vnd.ms-htmlhelp": {
        source: "iana",
        extensions: ["chm"]
      },
      "application/vnd.ms-ims": {
        source: "iana",
        extensions: ["ims"]
      },
      "application/vnd.ms-lrm": {
        source: "iana",
        extensions: ["lrm"]
      },
      "application/vnd.ms-office.activex+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-officetheme": {
        source: "iana",
        extensions: ["thmx"]
      },
      "application/vnd.ms-opentype": {
        source: "apache",
        compressible: true
      },
      "application/vnd.ms-outlook": {
        compressible: false,
        extensions: ["msg"]
      },
      "application/vnd.ms-package.obfuscated-opentype": {
        source: "apache"
      },
      "application/vnd.ms-pki.seccat": {
        source: "apache",
        extensions: ["cat"]
      },
      "application/vnd.ms-pki.stl": {
        source: "apache",
        extensions: ["stl"]
      },
      "application/vnd.ms-playready.initiator+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-powerpoint": {
        source: "iana",
        compressible: false,
        extensions: ["ppt", "pps", "pot"]
      },
      "application/vnd.ms-powerpoint.addin.macroenabled.12": {
        source: "iana",
        extensions: ["ppam"]
      },
      "application/vnd.ms-powerpoint.presentation.macroenabled.12": {
        source: "iana",
        extensions: ["pptm"]
      },
      "application/vnd.ms-powerpoint.slide.macroenabled.12": {
        source: "iana",
        extensions: ["sldm"]
      },
      "application/vnd.ms-powerpoint.slideshow.macroenabled.12": {
        source: "iana",
        extensions: ["ppsm"]
      },
      "application/vnd.ms-powerpoint.template.macroenabled.12": {
        source: "iana",
        extensions: ["potm"]
      },
      "application/vnd.ms-printdevicecapabilities+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-printing.printticket+xml": {
        source: "apache",
        compressible: true
      },
      "application/vnd.ms-printschematicket+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-project": {
        source: "iana",
        extensions: ["mpp", "mpt"]
      },
      "application/vnd.ms-tnef": {
        source: "iana"
      },
      "application/vnd.ms-windows.devicepairing": {
        source: "iana"
      },
      "application/vnd.ms-windows.nwprinting.oob": {
        source: "iana"
      },
      "application/vnd.ms-windows.printerpairing": {
        source: "iana"
      },
      "application/vnd.ms-windows.wsd.oob": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.lic-chlg-req": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.lic-resp": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.meter-chlg-req": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.meter-resp": {
        source: "iana"
      },
      "application/vnd.ms-word.document.macroenabled.12": {
        source: "iana",
        extensions: ["docm"]
      },
      "application/vnd.ms-word.template.macroenabled.12": {
        source: "iana",
        extensions: ["dotm"]
      },
      "application/vnd.ms-works": {
        source: "iana",
        extensions: ["wps", "wks", "wcm", "wdb"]
      },
      "application/vnd.ms-wpl": {
        source: "iana",
        extensions: ["wpl"]
      },
      "application/vnd.ms-xpsdocument": {
        source: "iana",
        compressible: false,
        extensions: ["xps"]
      },
      "application/vnd.msa-disk-image": {
        source: "iana"
      },
      "application/vnd.mseq": {
        source: "iana",
        extensions: ["mseq"]
      },
      "application/vnd.msign": {
        source: "iana"
      },
      "application/vnd.multiad.creator": {
        source: "iana"
      },
      "application/vnd.multiad.creator.cif": {
        source: "iana"
      },
      "application/vnd.music-niff": {
        source: "iana"
      },
      "application/vnd.musician": {
        source: "iana",
        extensions: ["mus"]
      },
      "application/vnd.muvee.style": {
        source: "iana",
        extensions: ["msty"]
      },
      "application/vnd.mynfc": {
        source: "iana",
        extensions: ["taglet"]
      },
      "application/vnd.nacamar.ybrid+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ncd.control": {
        source: "iana"
      },
      "application/vnd.ncd.reference": {
        source: "iana"
      },
      "application/vnd.nearst.inv+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nebumind.line": {
        source: "iana"
      },
      "application/vnd.nervana": {
        source: "iana"
      },
      "application/vnd.netfpx": {
        source: "iana"
      },
      "application/vnd.neurolanguage.nlu": {
        source: "iana",
        extensions: ["nlu"]
      },
      "application/vnd.nimn": {
        source: "iana"
      },
      "application/vnd.nintendo.nitro.rom": {
        source: "iana"
      },
      "application/vnd.nintendo.snes.rom": {
        source: "iana"
      },
      "application/vnd.nitf": {
        source: "iana",
        extensions: ["ntf", "nitf"]
      },
      "application/vnd.noblenet-directory": {
        source: "iana",
        extensions: ["nnd"]
      },
      "application/vnd.noblenet-sealer": {
        source: "iana",
        extensions: ["nns"]
      },
      "application/vnd.noblenet-web": {
        source: "iana",
        extensions: ["nnw"]
      },
      "application/vnd.nokia.catalogs": {
        source: "iana"
      },
      "application/vnd.nokia.conml+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.conml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.iptv.config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.isds-radio-presets": {
        source: "iana"
      },
      "application/vnd.nokia.landmark+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.landmark+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.landmarkcollection+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.n-gage.ac+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ac"]
      },
      "application/vnd.nokia.n-gage.data": {
        source: "iana",
        extensions: ["ngdat"]
      },
      "application/vnd.nokia.n-gage.symbian.install": {
        source: "iana",
        extensions: ["n-gage"]
      },
      "application/vnd.nokia.ncd": {
        source: "iana"
      },
      "application/vnd.nokia.pcd+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.pcd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.radio-preset": {
        source: "iana",
        extensions: ["rpst"]
      },
      "application/vnd.nokia.radio-presets": {
        source: "iana",
        extensions: ["rpss"]
      },
      "application/vnd.novadigm.edm": {
        source: "iana",
        extensions: ["edm"]
      },
      "application/vnd.novadigm.edx": {
        source: "iana",
        extensions: ["edx"]
      },
      "application/vnd.novadigm.ext": {
        source: "iana",
        extensions: ["ext"]
      },
      "application/vnd.ntt-local.content-share": {
        source: "iana"
      },
      "application/vnd.ntt-local.file-transfer": {
        source: "iana"
      },
      "application/vnd.ntt-local.ogw_remote-access": {
        source: "iana"
      },
      "application/vnd.ntt-local.sip-ta_remote": {
        source: "iana"
      },
      "application/vnd.ntt-local.sip-ta_tcp_stream": {
        source: "iana"
      },
      "application/vnd.oasis.opendocument.chart": {
        source: "iana",
        extensions: ["odc"]
      },
      "application/vnd.oasis.opendocument.chart-template": {
        source: "iana",
        extensions: ["otc"]
      },
      "application/vnd.oasis.opendocument.database": {
        source: "iana",
        extensions: ["odb"]
      },
      "application/vnd.oasis.opendocument.formula": {
        source: "iana",
        extensions: ["odf"]
      },
      "application/vnd.oasis.opendocument.formula-template": {
        source: "iana",
        extensions: ["odft"]
      },
      "application/vnd.oasis.opendocument.graphics": {
        source: "iana",
        compressible: false,
        extensions: ["odg"]
      },
      "application/vnd.oasis.opendocument.graphics-template": {
        source: "iana",
        extensions: ["otg"]
      },
      "application/vnd.oasis.opendocument.image": {
        source: "iana",
        extensions: ["odi"]
      },
      "application/vnd.oasis.opendocument.image-template": {
        source: "iana",
        extensions: ["oti"]
      },
      "application/vnd.oasis.opendocument.presentation": {
        source: "iana",
        compressible: false,
        extensions: ["odp"]
      },
      "application/vnd.oasis.opendocument.presentation-template": {
        source: "iana",
        extensions: ["otp"]
      },
      "application/vnd.oasis.opendocument.spreadsheet": {
        source: "iana",
        compressible: false,
        extensions: ["ods"]
      },
      "application/vnd.oasis.opendocument.spreadsheet-template": {
        source: "iana",
        extensions: ["ots"]
      },
      "application/vnd.oasis.opendocument.text": {
        source: "iana",
        compressible: false,
        extensions: ["odt"]
      },
      "application/vnd.oasis.opendocument.text-master": {
        source: "iana",
        extensions: ["odm"]
      },
      "application/vnd.oasis.opendocument.text-template": {
        source: "iana",
        extensions: ["ott"]
      },
      "application/vnd.oasis.opendocument.text-web": {
        source: "iana",
        extensions: ["oth"]
      },
      "application/vnd.obn": {
        source: "iana"
      },
      "application/vnd.ocf+cbor": {
        source: "iana"
      },
      "application/vnd.oci.image.manifest.v1+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oftn.l10n+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.contentaccessdownload+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.contentaccessstreaming+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.cspg-hexbinary": {
        source: "iana"
      },
      "application/vnd.oipf.dae.svg+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.dae.xhtml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.mippvcontrolmessage+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.pae.gem": {
        source: "iana"
      },
      "application/vnd.oipf.spdiscovery+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.spdlist+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.ueprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.userprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.olpc-sugar": {
        source: "iana",
        extensions: ["xo"]
      },
      "application/vnd.oma-scws-config": {
        source: "iana"
      },
      "application/vnd.oma-scws-http-request": {
        source: "iana"
      },
      "application/vnd.oma-scws-http-response": {
        source: "iana"
      },
      "application/vnd.oma.bcast.associated-procedure-parameter+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.drm-trigger+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.imd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.ltkm": {
        source: "iana"
      },
      "application/vnd.oma.bcast.notification+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.provisioningtrigger": {
        source: "iana"
      },
      "application/vnd.oma.bcast.sgboot": {
        source: "iana"
      },
      "application/vnd.oma.bcast.sgdd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.sgdu": {
        source: "iana"
      },
      "application/vnd.oma.bcast.simple-symbol-container": {
        source: "iana"
      },
      "application/vnd.oma.bcast.smartcard-trigger+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.sprov+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.stkm": {
        source: "iana"
      },
      "application/vnd.oma.cab-address-book+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-feature-handler+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-pcc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-subs-invite+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-user-prefs+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.dcd": {
        source: "iana"
      },
      "application/vnd.oma.dcdc": {
        source: "iana"
      },
      "application/vnd.oma.dd2+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dd2"]
      },
      "application/vnd.oma.drm.risd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.group-usage-list+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.lwm2m+cbor": {
        source: "iana"
      },
      "application/vnd.oma.lwm2m+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.lwm2m+tlv": {
        source: "iana"
      },
      "application/vnd.oma.pal+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.detailed-progress-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.final-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.groups+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.invocation-descriptor+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.optimized-progress-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.push": {
        source: "iana"
      },
      "application/vnd.oma.scidm.messages+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.xcap-directory+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.omads-email+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omads-file+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omads-folder+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omaloc-supl-init": {
        source: "iana"
      },
      "application/vnd.onepager": {
        source: "iana"
      },
      "application/vnd.onepagertamp": {
        source: "iana"
      },
      "application/vnd.onepagertamx": {
        source: "iana"
      },
      "application/vnd.onepagertat": {
        source: "iana"
      },
      "application/vnd.onepagertatp": {
        source: "iana"
      },
      "application/vnd.onepagertatx": {
        source: "iana"
      },
      "application/vnd.openblox.game+xml": {
        source: "iana",
        compressible: true,
        extensions: ["obgx"]
      },
      "application/vnd.openblox.game-binary": {
        source: "iana"
      },
      "application/vnd.openeye.oeb": {
        source: "iana"
      },
      "application/vnd.openofficeorg.extension": {
        source: "apache",
        extensions: ["oxt"]
      },
      "application/vnd.openstreetmap.data+xml": {
        source: "iana",
        compressible: true,
        extensions: ["osm"]
      },
      "application/vnd.opentimestamps.ots": {
        source: "iana"
      },
      "application/vnd.openxmlformats-officedocument.custom-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawing+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.extended-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
        source: "iana",
        compressible: false,
        extensions: ["pptx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slide": {
        source: "iana",
        extensions: ["sldx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow": {
        source: "iana",
        extensions: ["ppsx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.template": {
        source: "iana",
        extensions: ["potx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        source: "iana",
        compressible: false,
        extensions: ["xlsx"]
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template": {
        source: "iana",
        extensions: ["xltx"]
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.theme+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.themeoverride+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.vmldrawing": {
        source: "iana"
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
        source: "iana",
        compressible: false,
        extensions: ["docx"]
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template": {
        source: "iana",
        extensions: ["dotx"]
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.core-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.relationships+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oracle.resource+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.orange.indata": {
        source: "iana"
      },
      "application/vnd.osa.netdeploy": {
        source: "iana"
      },
      "application/vnd.osgeo.mapguide.package": {
        source: "iana",
        extensions: ["mgp"]
      },
      "application/vnd.osgi.bundle": {
        source: "iana"
      },
      "application/vnd.osgi.dp": {
        source: "iana",
        extensions: ["dp"]
      },
      "application/vnd.osgi.subsystem": {
        source: "iana",
        extensions: ["esa"]
      },
      "application/vnd.otps.ct-kip+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oxli.countgraph": {
        source: "iana"
      },
      "application/vnd.pagerduty+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.palm": {
        source: "iana",
        extensions: ["pdb", "pqa", "oprc"]
      },
      "application/vnd.panoply": {
        source: "iana"
      },
      "application/vnd.paos.xml": {
        source: "iana"
      },
      "application/vnd.patentdive": {
        source: "iana"
      },
      "application/vnd.patientecommsdoc": {
        source: "iana"
      },
      "application/vnd.pawaafile": {
        source: "iana",
        extensions: ["paw"]
      },
      "application/vnd.pcos": {
        source: "iana"
      },
      "application/vnd.pg.format": {
        source: "iana",
        extensions: ["str"]
      },
      "application/vnd.pg.osasli": {
        source: "iana",
        extensions: ["ei6"]
      },
      "application/vnd.piaccess.application-licence": {
        source: "iana"
      },
      "application/vnd.picsel": {
        source: "iana",
        extensions: ["efif"]
      },
      "application/vnd.pmi.widget": {
        source: "iana",
        extensions: ["wg"]
      },
      "application/vnd.poc.group-advertisement+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.pocketlearn": {
        source: "iana",
        extensions: ["plf"]
      },
      "application/vnd.powerbuilder6": {
        source: "iana",
        extensions: ["pbd"]
      },
      "application/vnd.powerbuilder6-s": {
        source: "iana"
      },
      "application/vnd.powerbuilder7": {
        source: "iana"
      },
      "application/vnd.powerbuilder7-s": {
        source: "iana"
      },
      "application/vnd.powerbuilder75": {
        source: "iana"
      },
      "application/vnd.powerbuilder75-s": {
        source: "iana"
      },
      "application/vnd.preminet": {
        source: "iana"
      },
      "application/vnd.previewsystems.box": {
        source: "iana",
        extensions: ["box"]
      },
      "application/vnd.proteus.magazine": {
        source: "iana",
        extensions: ["mgz"]
      },
      "application/vnd.psfs": {
        source: "iana"
      },
      "application/vnd.publishare-delta-tree": {
        source: "iana",
        extensions: ["qps"]
      },
      "application/vnd.pvi.ptid1": {
        source: "iana",
        extensions: ["ptid"]
      },
      "application/vnd.pwg-multiplexed": {
        source: "iana"
      },
      "application/vnd.pwg-xhtml-print+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.qualcomm.brew-app-res": {
        source: "iana"
      },
      "application/vnd.quarantainenet": {
        source: "iana"
      },
      "application/vnd.quark.quarkxpress": {
        source: "iana",
        extensions: ["qxd", "qxt", "qwd", "qwt", "qxl", "qxb"]
      },
      "application/vnd.quobject-quoxdocument": {
        source: "iana"
      },
      "application/vnd.radisys.moml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-conf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-conn+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-dialog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-stream+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-conf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-base+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-fax-detect+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-group+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-speech+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-transform+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.rainstor.data": {
        source: "iana"
      },
      "application/vnd.rapid": {
        source: "iana"
      },
      "application/vnd.rar": {
        source: "iana",
        extensions: ["rar"]
      },
      "application/vnd.realvnc.bed": {
        source: "iana",
        extensions: ["bed"]
      },
      "application/vnd.recordare.musicxml": {
        source: "iana",
        extensions: ["mxl"]
      },
      "application/vnd.recordare.musicxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["musicxml"]
      },
      "application/vnd.renlearn.rlprint": {
        source: "iana"
      },
      "application/vnd.resilient.logic": {
        source: "iana"
      },
      "application/vnd.restful+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.rig.cryptonote": {
        source: "iana",
        extensions: ["cryptonote"]
      },
      "application/vnd.rim.cod": {
        source: "apache",
        extensions: ["cod"]
      },
      "application/vnd.rn-realmedia": {
        source: "apache",
        extensions: ["rm"]
      },
      "application/vnd.rn-realmedia-vbr": {
        source: "apache",
        extensions: ["rmvb"]
      },
      "application/vnd.route66.link66+xml": {
        source: "iana",
        compressible: true,
        extensions: ["link66"]
      },
      "application/vnd.rs-274x": {
        source: "iana"
      },
      "application/vnd.ruckus.download": {
        source: "iana"
      },
      "application/vnd.s3sms": {
        source: "iana"
      },
      "application/vnd.sailingtracker.track": {
        source: "iana",
        extensions: ["st"]
      },
      "application/vnd.sar": {
        source: "iana"
      },
      "application/vnd.sbm.cid": {
        source: "iana"
      },
      "application/vnd.sbm.mid2": {
        source: "iana"
      },
      "application/vnd.scribus": {
        source: "iana"
      },
      "application/vnd.sealed.3df": {
        source: "iana"
      },
      "application/vnd.sealed.csf": {
        source: "iana"
      },
      "application/vnd.sealed.doc": {
        source: "iana"
      },
      "application/vnd.sealed.eml": {
        source: "iana"
      },
      "application/vnd.sealed.mht": {
        source: "iana"
      },
      "application/vnd.sealed.net": {
        source: "iana"
      },
      "application/vnd.sealed.ppt": {
        source: "iana"
      },
      "application/vnd.sealed.tiff": {
        source: "iana"
      },
      "application/vnd.sealed.xls": {
        source: "iana"
      },
      "application/vnd.sealedmedia.softseal.html": {
        source: "iana"
      },
      "application/vnd.sealedmedia.softseal.pdf": {
        source: "iana"
      },
      "application/vnd.seemail": {
        source: "iana",
        extensions: ["see"]
      },
      "application/vnd.seis+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.sema": {
        source: "iana",
        extensions: ["sema"]
      },
      "application/vnd.semd": {
        source: "iana",
        extensions: ["semd"]
      },
      "application/vnd.semf": {
        source: "iana",
        extensions: ["semf"]
      },
      "application/vnd.shade-save-file": {
        source: "iana"
      },
      "application/vnd.shana.informed.formdata": {
        source: "iana",
        extensions: ["ifm"]
      },
      "application/vnd.shana.informed.formtemplate": {
        source: "iana",
        extensions: ["itp"]
      },
      "application/vnd.shana.informed.interchange": {
        source: "iana",
        extensions: ["iif"]
      },
      "application/vnd.shana.informed.package": {
        source: "iana",
        extensions: ["ipk"]
      },
      "application/vnd.shootproof+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.shopkick+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.shp": {
        source: "iana"
      },
      "application/vnd.shx": {
        source: "iana"
      },
      "application/vnd.sigrok.session": {
        source: "iana"
      },
      "application/vnd.simtech-mindmapper": {
        source: "iana",
        extensions: ["twd", "twds"]
      },
      "application/vnd.siren+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.smaf": {
        source: "iana",
        extensions: ["mmf"]
      },
      "application/vnd.smart.notebook": {
        source: "iana"
      },
      "application/vnd.smart.teacher": {
        source: "iana",
        extensions: ["teacher"]
      },
      "application/vnd.snesdev-page-table": {
        source: "iana"
      },
      "application/vnd.software602.filler.form+xml": {
        source: "iana",
        compressible: true,
        extensions: ["fo"]
      },
      "application/vnd.software602.filler.form-xml-zip": {
        source: "iana"
      },
      "application/vnd.solent.sdkm+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sdkm", "sdkd"]
      },
      "application/vnd.spotfire.dxp": {
        source: "iana",
        extensions: ["dxp"]
      },
      "application/vnd.spotfire.sfs": {
        source: "iana",
        extensions: ["sfs"]
      },
      "application/vnd.sqlite3": {
        source: "iana"
      },
      "application/vnd.sss-cod": {
        source: "iana"
      },
      "application/vnd.sss-dtf": {
        source: "iana"
      },
      "application/vnd.sss-ntf": {
        source: "iana"
      },
      "application/vnd.stardivision.calc": {
        source: "apache",
        extensions: ["sdc"]
      },
      "application/vnd.stardivision.draw": {
        source: "apache",
        extensions: ["sda"]
      },
      "application/vnd.stardivision.impress": {
        source: "apache",
        extensions: ["sdd"]
      },
      "application/vnd.stardivision.math": {
        source: "apache",
        extensions: ["smf"]
      },
      "application/vnd.stardivision.writer": {
        source: "apache",
        extensions: ["sdw", "vor"]
      },
      "application/vnd.stardivision.writer-global": {
        source: "apache",
        extensions: ["sgl"]
      },
      "application/vnd.stepmania.package": {
        source: "iana",
        extensions: ["smzip"]
      },
      "application/vnd.stepmania.stepchart": {
        source: "iana",
        extensions: ["sm"]
      },
      "application/vnd.street-stream": {
        source: "iana"
      },
      "application/vnd.sun.wadl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wadl"]
      },
      "application/vnd.sun.xml.calc": {
        source: "apache",
        extensions: ["sxc"]
      },
      "application/vnd.sun.xml.calc.template": {
        source: "apache",
        extensions: ["stc"]
      },
      "application/vnd.sun.xml.draw": {
        source: "apache",
        extensions: ["sxd"]
      },
      "application/vnd.sun.xml.draw.template": {
        source: "apache",
        extensions: ["std"]
      },
      "application/vnd.sun.xml.impress": {
        source: "apache",
        extensions: ["sxi"]
      },
      "application/vnd.sun.xml.impress.template": {
        source: "apache",
        extensions: ["sti"]
      },
      "application/vnd.sun.xml.math": {
        source: "apache",
        extensions: ["sxm"]
      },
      "application/vnd.sun.xml.writer": {
        source: "apache",
        extensions: ["sxw"]
      },
      "application/vnd.sun.xml.writer.global": {
        source: "apache",
        extensions: ["sxg"]
      },
      "application/vnd.sun.xml.writer.template": {
        source: "apache",
        extensions: ["stw"]
      },
      "application/vnd.sus-calendar": {
        source: "iana",
        extensions: ["sus", "susp"]
      },
      "application/vnd.svd": {
        source: "iana",
        extensions: ["svd"]
      },
      "application/vnd.swiftview-ics": {
        source: "iana"
      },
      "application/vnd.sycle+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.syft+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.symbian.install": {
        source: "apache",
        extensions: ["sis", "sisx"]
      },
      "application/vnd.syncml+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["xsm"]
      },
      "application/vnd.syncml.dm+wbxml": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["bdm"]
      },
      "application/vnd.syncml.dm+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["xdm"]
      },
      "application/vnd.syncml.dm.notification": {
        source: "iana"
      },
      "application/vnd.syncml.dmddf+wbxml": {
        source: "iana"
      },
      "application/vnd.syncml.dmddf+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["ddf"]
      },
      "application/vnd.syncml.dmtnds+wbxml": {
        source: "iana"
      },
      "application/vnd.syncml.dmtnds+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.syncml.ds.notification": {
        source: "iana"
      },
      "application/vnd.tableschema+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tao.intent-module-archive": {
        source: "iana",
        extensions: ["tao"]
      },
      "application/vnd.tcpdump.pcap": {
        source: "iana",
        extensions: ["pcap", "cap", "dmp"]
      },
      "application/vnd.think-cell.ppttc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tmd.mediaflex.api+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tml": {
        source: "iana"
      },
      "application/vnd.tmobile-livetv": {
        source: "iana",
        extensions: ["tmo"]
      },
      "application/vnd.tri.onesource": {
        source: "iana"
      },
      "application/vnd.trid.tpt": {
        source: "iana",
        extensions: ["tpt"]
      },
      "application/vnd.triscape.mxs": {
        source: "iana",
        extensions: ["mxs"]
      },
      "application/vnd.trueapp": {
        source: "iana",
        extensions: ["tra"]
      },
      "application/vnd.truedoc": {
        source: "iana"
      },
      "application/vnd.ubisoft.webplayer": {
        source: "iana"
      },
      "application/vnd.ufdl": {
        source: "iana",
        extensions: ["ufd", "ufdl"]
      },
      "application/vnd.uiq.theme": {
        source: "iana",
        extensions: ["utz"]
      },
      "application/vnd.umajin": {
        source: "iana",
        extensions: ["umj"]
      },
      "application/vnd.unity": {
        source: "iana",
        extensions: ["unityweb"]
      },
      "application/vnd.uoml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["uoml"]
      },
      "application/vnd.uplanet.alert": {
        source: "iana"
      },
      "application/vnd.uplanet.alert-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.bearer-choice": {
        source: "iana"
      },
      "application/vnd.uplanet.bearer-choice-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.cacheop": {
        source: "iana"
      },
      "application/vnd.uplanet.cacheop-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.channel": {
        source: "iana"
      },
      "application/vnd.uplanet.channel-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.list": {
        source: "iana"
      },
      "application/vnd.uplanet.list-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.listcmd": {
        source: "iana"
      },
      "application/vnd.uplanet.listcmd-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.signal": {
        source: "iana"
      },
      "application/vnd.uri-map": {
        source: "iana"
      },
      "application/vnd.valve.source.material": {
        source: "iana"
      },
      "application/vnd.vcx": {
        source: "iana",
        extensions: ["vcx"]
      },
      "application/vnd.vd-study": {
        source: "iana"
      },
      "application/vnd.vectorworks": {
        source: "iana"
      },
      "application/vnd.vel+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.verimatrix.vcas": {
        source: "iana"
      },
      "application/vnd.veritone.aion+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.veryant.thin": {
        source: "iana"
      },
      "application/vnd.ves.encrypted": {
        source: "iana"
      },
      "application/vnd.vidsoft.vidconference": {
        source: "iana"
      },
      "application/vnd.visio": {
        source: "iana",
        extensions: ["vsd", "vst", "vss", "vsw"]
      },
      "application/vnd.visionary": {
        source: "iana",
        extensions: ["vis"]
      },
      "application/vnd.vividence.scriptfile": {
        source: "iana"
      },
      "application/vnd.vsf": {
        source: "iana",
        extensions: ["vsf"]
      },
      "application/vnd.wap.sic": {
        source: "iana"
      },
      "application/vnd.wap.slc": {
        source: "iana"
      },
      "application/vnd.wap.wbxml": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["wbxml"]
      },
      "application/vnd.wap.wmlc": {
        source: "iana",
        extensions: ["wmlc"]
      },
      "application/vnd.wap.wmlscriptc": {
        source: "iana",
        extensions: ["wmlsc"]
      },
      "application/vnd.webturbo": {
        source: "iana",
        extensions: ["wtb"]
      },
      "application/vnd.wfa.dpp": {
        source: "iana"
      },
      "application/vnd.wfa.p2p": {
        source: "iana"
      },
      "application/vnd.wfa.wsc": {
        source: "iana"
      },
      "application/vnd.windows.devicepairing": {
        source: "iana"
      },
      "application/vnd.wmc": {
        source: "iana"
      },
      "application/vnd.wmf.bootstrap": {
        source: "iana"
      },
      "application/vnd.wolfram.mathematica": {
        source: "iana"
      },
      "application/vnd.wolfram.mathematica.package": {
        source: "iana"
      },
      "application/vnd.wolfram.player": {
        source: "iana",
        extensions: ["nbp"]
      },
      "application/vnd.wordperfect": {
        source: "iana",
        extensions: ["wpd"]
      },
      "application/vnd.wqd": {
        source: "iana",
        extensions: ["wqd"]
      },
      "application/vnd.wrq-hp3000-labelled": {
        source: "iana"
      },
      "application/vnd.wt.stf": {
        source: "iana",
        extensions: ["stf"]
      },
      "application/vnd.wv.csp+wbxml": {
        source: "iana"
      },
      "application/vnd.wv.csp+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.wv.ssp+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xacml+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xara": {
        source: "iana",
        extensions: ["xar"]
      },
      "application/vnd.xfdl": {
        source: "iana",
        extensions: ["xfdl"]
      },
      "application/vnd.xfdl.webform": {
        source: "iana"
      },
      "application/vnd.xmi+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xmpie.cpkg": {
        source: "iana"
      },
      "application/vnd.xmpie.dpkg": {
        source: "iana"
      },
      "application/vnd.xmpie.plan": {
        source: "iana"
      },
      "application/vnd.xmpie.ppkg": {
        source: "iana"
      },
      "application/vnd.xmpie.xlim": {
        source: "iana"
      },
      "application/vnd.yamaha.hv-dic": {
        source: "iana",
        extensions: ["hvd"]
      },
      "application/vnd.yamaha.hv-script": {
        source: "iana",
        extensions: ["hvs"]
      },
      "application/vnd.yamaha.hv-voice": {
        source: "iana",
        extensions: ["hvp"]
      },
      "application/vnd.yamaha.openscoreformat": {
        source: "iana",
        extensions: ["osf"]
      },
      "application/vnd.yamaha.openscoreformat.osfpvg+xml": {
        source: "iana",
        compressible: true,
        extensions: ["osfpvg"]
      },
      "application/vnd.yamaha.remote-setup": {
        source: "iana"
      },
      "application/vnd.yamaha.smaf-audio": {
        source: "iana",
        extensions: ["saf"]
      },
      "application/vnd.yamaha.smaf-phrase": {
        source: "iana",
        extensions: ["spf"]
      },
      "application/vnd.yamaha.through-ngn": {
        source: "iana"
      },
      "application/vnd.yamaha.tunnel-udpencap": {
        source: "iana"
      },
      "application/vnd.yaoweme": {
        source: "iana"
      },
      "application/vnd.yellowriver-custom-menu": {
        source: "iana",
        extensions: ["cmp"]
      },
      "application/vnd.youtube.yt": {
        source: "iana"
      },
      "application/vnd.zul": {
        source: "iana",
        extensions: ["zir", "zirz"]
      },
      "application/vnd.zzazz.deck+xml": {
        source: "iana",
        compressible: true,
        extensions: ["zaz"]
      },
      "application/voicexml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["vxml"]
      },
      "application/voucher-cms+json": {
        source: "iana",
        compressible: true
      },
      "application/vq-rtcpxr": {
        source: "iana"
      },
      "application/wasm": {
        source: "iana",
        compressible: true,
        extensions: ["wasm"]
      },
      "application/watcherinfo+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wif"]
      },
      "application/webpush-options+json": {
        source: "iana",
        compressible: true
      },
      "application/whoispp-query": {
        source: "iana"
      },
      "application/whoispp-response": {
        source: "iana"
      },
      "application/widget": {
        source: "iana",
        extensions: ["wgt"]
      },
      "application/winhlp": {
        source: "apache",
        extensions: ["hlp"]
      },
      "application/wita": {
        source: "iana"
      },
      "application/wordperfect5.1": {
        source: "iana"
      },
      "application/wsdl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wsdl"]
      },
      "application/wspolicy+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wspolicy"]
      },
      "application/x-7z-compressed": {
        source: "apache",
        compressible: false,
        extensions: ["7z"]
      },
      "application/x-abiword": {
        source: "apache",
        extensions: ["abw"]
      },
      "application/x-ace-compressed": {
        source: "apache",
        extensions: ["ace"]
      },
      "application/x-amf": {
        source: "apache"
      },
      "application/x-apple-diskimage": {
        source: "apache",
        extensions: ["dmg"]
      },
      "application/x-arj": {
        compressible: false,
        extensions: ["arj"]
      },
      "application/x-authorware-bin": {
        source: "apache",
        extensions: ["aab", "x32", "u32", "vox"]
      },
      "application/x-authorware-map": {
        source: "apache",
        extensions: ["aam"]
      },
      "application/x-authorware-seg": {
        source: "apache",
        extensions: ["aas"]
      },
      "application/x-bcpio": {
        source: "apache",
        extensions: ["bcpio"]
      },
      "application/x-bdoc": {
        compressible: false,
        extensions: ["bdoc"]
      },
      "application/x-bittorrent": {
        source: "apache",
        extensions: ["torrent"]
      },
      "application/x-blorb": {
        source: "apache",
        extensions: ["blb", "blorb"]
      },
      "application/x-bzip": {
        source: "apache",
        compressible: false,
        extensions: ["bz"]
      },
      "application/x-bzip2": {
        source: "apache",
        compressible: false,
        extensions: ["bz2", "boz"]
      },
      "application/x-cbr": {
        source: "apache",
        extensions: ["cbr", "cba", "cbt", "cbz", "cb7"]
      },
      "application/x-cdlink": {
        source: "apache",
        extensions: ["vcd"]
      },
      "application/x-cfs-compressed": {
        source: "apache",
        extensions: ["cfs"]
      },
      "application/x-chat": {
        source: "apache",
        extensions: ["chat"]
      },
      "application/x-chess-pgn": {
        source: "apache",
        extensions: ["pgn"]
      },
      "application/x-chrome-extension": {
        extensions: ["crx"]
      },
      "application/x-cocoa": {
        source: "nginx",
        extensions: ["cco"]
      },
      "application/x-compress": {
        source: "apache"
      },
      "application/x-conference": {
        source: "apache",
        extensions: ["nsc"]
      },
      "application/x-cpio": {
        source: "apache",
        extensions: ["cpio"]
      },
      "application/x-csh": {
        source: "apache",
        extensions: ["csh"]
      },
      "application/x-deb": {
        compressible: false
      },
      "application/x-debian-package": {
        source: "apache",
        extensions: ["deb", "udeb"]
      },
      "application/x-dgc-compressed": {
        source: "apache",
        extensions: ["dgc"]
      },
      "application/x-director": {
        source: "apache",
        extensions: ["dir", "dcr", "dxr", "cst", "cct", "cxt", "w3d", "fgd", "swa"]
      },
      "application/x-doom": {
        source: "apache",
        extensions: ["wad"]
      },
      "application/x-dtbncx+xml": {
        source: "apache",
        compressible: true,
        extensions: ["ncx"]
      },
      "application/x-dtbook+xml": {
        source: "apache",
        compressible: true,
        extensions: ["dtb"]
      },
      "application/x-dtbresource+xml": {
        source: "apache",
        compressible: true,
        extensions: ["res"]
      },
      "application/x-dvi": {
        source: "apache",
        compressible: false,
        extensions: ["dvi"]
      },
      "application/x-envoy": {
        source: "apache",
        extensions: ["evy"]
      },
      "application/x-eva": {
        source: "apache",
        extensions: ["eva"]
      },
      "application/x-font-bdf": {
        source: "apache",
        extensions: ["bdf"]
      },
      "application/x-font-dos": {
        source: "apache"
      },
      "application/x-font-framemaker": {
        source: "apache"
      },
      "application/x-font-ghostscript": {
        source: "apache",
        extensions: ["gsf"]
      },
      "application/x-font-libgrx": {
        source: "apache"
      },
      "application/x-font-linux-psf": {
        source: "apache",
        extensions: ["psf"]
      },
      "application/x-font-pcf": {
        source: "apache",
        extensions: ["pcf"]
      },
      "application/x-font-snf": {
        source: "apache",
        extensions: ["snf"]
      },
      "application/x-font-speedo": {
        source: "apache"
      },
      "application/x-font-sunos-news": {
        source: "apache"
      },
      "application/x-font-type1": {
        source: "apache",
        extensions: ["pfa", "pfb", "pfm", "afm"]
      },
      "application/x-font-vfont": {
        source: "apache"
      },
      "application/x-freearc": {
        source: "apache",
        extensions: ["arc"]
      },
      "application/x-futuresplash": {
        source: "apache",
        extensions: ["spl"]
      },
      "application/x-gca-compressed": {
        source: "apache",
        extensions: ["gca"]
      },
      "application/x-glulx": {
        source: "apache",
        extensions: ["ulx"]
      },
      "application/x-gnumeric": {
        source: "apache",
        extensions: ["gnumeric"]
      },
      "application/x-gramps-xml": {
        source: "apache",
        extensions: ["gramps"]
      },
      "application/x-gtar": {
        source: "apache",
        extensions: ["gtar"]
      },
      "application/x-gzip": {
        source: "apache"
      },
      "application/x-hdf": {
        source: "apache",
        extensions: ["hdf"]
      },
      "application/x-httpd-php": {
        compressible: true,
        extensions: ["php"]
      },
      "application/x-install-instructions": {
        source: "apache",
        extensions: ["install"]
      },
      "application/x-iso9660-image": {
        source: "apache",
        extensions: ["iso"]
      },
      "application/x-iwork-keynote-sffkey": {
        extensions: ["key"]
      },
      "application/x-iwork-numbers-sffnumbers": {
        extensions: ["numbers"]
      },
      "application/x-iwork-pages-sffpages": {
        extensions: ["pages"]
      },
      "application/x-java-archive-diff": {
        source: "nginx",
        extensions: ["jardiff"]
      },
      "application/x-java-jnlp-file": {
        source: "apache",
        compressible: false,
        extensions: ["jnlp"]
      },
      "application/x-javascript": {
        compressible: true
      },
      "application/x-keepass2": {
        extensions: ["kdbx"]
      },
      "application/x-latex": {
        source: "apache",
        compressible: false,
        extensions: ["latex"]
      },
      "application/x-lua-bytecode": {
        extensions: ["luac"]
      },
      "application/x-lzh-compressed": {
        source: "apache",
        extensions: ["lzh", "lha"]
      },
      "application/x-makeself": {
        source: "nginx",
        extensions: ["run"]
      },
      "application/x-mie": {
        source: "apache",
        extensions: ["mie"]
      },
      "application/x-mobipocket-ebook": {
        source: "apache",
        extensions: ["prc", "mobi"]
      },
      "application/x-mpegurl": {
        compressible: false
      },
      "application/x-ms-application": {
        source: "apache",
        extensions: ["application"]
      },
      "application/x-ms-shortcut": {
        source: "apache",
        extensions: ["lnk"]
      },
      "application/x-ms-wmd": {
        source: "apache",
        extensions: ["wmd"]
      },
      "application/x-ms-wmz": {
        source: "apache",
        extensions: ["wmz"]
      },
      "application/x-ms-xbap": {
        source: "apache",
        extensions: ["xbap"]
      },
      "application/x-msaccess": {
        source: "apache",
        extensions: ["mdb"]
      },
      "application/x-msbinder": {
        source: "apache",
        extensions: ["obd"]
      },
      "application/x-mscardfile": {
        source: "apache",
        extensions: ["crd"]
      },
      "application/x-msclip": {
        source: "apache",
        extensions: ["clp"]
      },
      "application/x-msdos-program": {
        extensions: ["exe"]
      },
      "application/x-msdownload": {
        source: "apache",
        extensions: ["exe", "dll", "com", "bat", "msi"]
      },
      "application/x-msmediaview": {
        source: "apache",
        extensions: ["mvb", "m13", "m14"]
      },
      "application/x-msmetafile": {
        source: "apache",
        extensions: ["wmf", "wmz", "emf", "emz"]
      },
      "application/x-msmoney": {
        source: "apache",
        extensions: ["mny"]
      },
      "application/x-mspublisher": {
        source: "apache",
        extensions: ["pub"]
      },
      "application/x-msschedule": {
        source: "apache",
        extensions: ["scd"]
      },
      "application/x-msterminal": {
        source: "apache",
        extensions: ["trm"]
      },
      "application/x-mswrite": {
        source: "apache",
        extensions: ["wri"]
      },
      "application/x-netcdf": {
        source: "apache",
        extensions: ["nc", "cdf"]
      },
      "application/x-ns-proxy-autoconfig": {
        compressible: true,
        extensions: ["pac"]
      },
      "application/x-nzb": {
        source: "apache",
        extensions: ["nzb"]
      },
      "application/x-perl": {
        source: "nginx",
        extensions: ["pl", "pm"]
      },
      "application/x-pilot": {
        source: "nginx",
        extensions: ["prc", "pdb"]
      },
      "application/x-pkcs12": {
        source: "apache",
        compressible: false,
        extensions: ["p12", "pfx"]
      },
      "application/x-pkcs7-certificates": {
        source: "apache",
        extensions: ["p7b", "spc"]
      },
      "application/x-pkcs7-certreqresp": {
        source: "apache",
        extensions: ["p7r"]
      },
      "application/x-pki-message": {
        source: "iana"
      },
      "application/x-rar-compressed": {
        source: "apache",
        compressible: false,
        extensions: ["rar"]
      },
      "application/x-redhat-package-manager": {
        source: "nginx",
        extensions: ["rpm"]
      },
      "application/x-research-info-systems": {
        source: "apache",
        extensions: ["ris"]
      },
      "application/x-sea": {
        source: "nginx",
        extensions: ["sea"]
      },
      "application/x-sh": {
        source: "apache",
        compressible: true,
        extensions: ["sh"]
      },
      "application/x-shar": {
        source: "apache",
        extensions: ["shar"]
      },
      "application/x-shockwave-flash": {
        source: "apache",
        compressible: false,
        extensions: ["swf"]
      },
      "application/x-silverlight-app": {
        source: "apache",
        extensions: ["xap"]
      },
      "application/x-sql": {
        source: "apache",
        extensions: ["sql"]
      },
      "application/x-stuffit": {
        source: "apache",
        compressible: false,
        extensions: ["sit"]
      },
      "application/x-stuffitx": {
        source: "apache",
        extensions: ["sitx"]
      },
      "application/x-subrip": {
        source: "apache",
        extensions: ["srt"]
      },
      "application/x-sv4cpio": {
        source: "apache",
        extensions: ["sv4cpio"]
      },
      "application/x-sv4crc": {
        source: "apache",
        extensions: ["sv4crc"]
      },
      "application/x-t3vm-image": {
        source: "apache",
        extensions: ["t3"]
      },
      "application/x-tads": {
        source: "apache",
        extensions: ["gam"]
      },
      "application/x-tar": {
        source: "apache",
        compressible: true,
        extensions: ["tar"]
      },
      "application/x-tcl": {
        source: "apache",
        extensions: ["tcl", "tk"]
      },
      "application/x-tex": {
        source: "apache",
        extensions: ["tex"]
      },
      "application/x-tex-tfm": {
        source: "apache",
        extensions: ["tfm"]
      },
      "application/x-texinfo": {
        source: "apache",
        extensions: ["texinfo", "texi"]
      },
      "application/x-tgif": {
        source: "apache",
        extensions: ["obj"]
      },
      "application/x-ustar": {
        source: "apache",
        extensions: ["ustar"]
      },
      "application/x-virtualbox-hdd": {
        compressible: true,
        extensions: ["hdd"]
      },
      "application/x-virtualbox-ova": {
        compressible: true,
        extensions: ["ova"]
      },
      "application/x-virtualbox-ovf": {
        compressible: true,
        extensions: ["ovf"]
      },
      "application/x-virtualbox-vbox": {
        compressible: true,
        extensions: ["vbox"]
      },
      "application/x-virtualbox-vbox-extpack": {
        compressible: false,
        extensions: ["vbox-extpack"]
      },
      "application/x-virtualbox-vdi": {
        compressible: true,
        extensions: ["vdi"]
      },
      "application/x-virtualbox-vhd": {
        compressible: true,
        extensions: ["vhd"]
      },
      "application/x-virtualbox-vmdk": {
        compressible: true,
        extensions: ["vmdk"]
      },
      "application/x-wais-source": {
        source: "apache",
        extensions: ["src"]
      },
      "application/x-web-app-manifest+json": {
        compressible: true,
        extensions: ["webapp"]
      },
      "application/x-www-form-urlencoded": {
        source: "iana",
        compressible: true
      },
      "application/x-x509-ca-cert": {
        source: "iana",
        extensions: ["der", "crt", "pem"]
      },
      "application/x-x509-ca-ra-cert": {
        source: "iana"
      },
      "application/x-x509-next-ca-cert": {
        source: "iana"
      },
      "application/x-xfig": {
        source: "apache",
        extensions: ["fig"]
      },
      "application/x-xliff+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xlf"]
      },
      "application/x-xpinstall": {
        source: "apache",
        compressible: false,
        extensions: ["xpi"]
      },
      "application/x-xz": {
        source: "apache",
        extensions: ["xz"]
      },
      "application/x-zmachine": {
        source: "apache",
        extensions: ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"]
      },
      "application/x400-bp": {
        source: "iana"
      },
      "application/xacml+xml": {
        source: "iana",
        compressible: true
      },
      "application/xaml+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xaml"]
      },
      "application/xcap-att+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xav"]
      },
      "application/xcap-caps+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xca"]
      },
      "application/xcap-diff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdf"]
      },
      "application/xcap-el+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xel"]
      },
      "application/xcap-error+xml": {
        source: "iana",
        compressible: true
      },
      "application/xcap-ns+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xns"]
      },
      "application/xcon-conference-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/xcon-conference-info-diff+xml": {
        source: "iana",
        compressible: true
      },
      "application/xenc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xenc"]
      },
      "application/xhtml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xhtml", "xht"]
      },
      "application/xhtml-voice+xml": {
        source: "apache",
        compressible: true
      },
      "application/xliff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xlf"]
      },
      "application/xml": {
        source: "iana",
        compressible: true,
        extensions: ["xml", "xsl", "xsd", "rng"]
      },
      "application/xml-dtd": {
        source: "iana",
        compressible: true,
        extensions: ["dtd"]
      },
      "application/xml-external-parsed-entity": {
        source: "iana"
      },
      "application/xml-patch+xml": {
        source: "iana",
        compressible: true
      },
      "application/xmpp+xml": {
        source: "iana",
        compressible: true
      },
      "application/xop+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xop"]
      },
      "application/xproc+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xpl"]
      },
      "application/xslt+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xsl", "xslt"]
      },
      "application/xspf+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xspf"]
      },
      "application/xv+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mxml", "xhvml", "xvml", "xvm"]
      },
      "application/yang": {
        source: "iana",
        extensions: ["yang"]
      },
      "application/yang-data+json": {
        source: "iana",
        compressible: true
      },
      "application/yang-data+xml": {
        source: "iana",
        compressible: true
      },
      "application/yang-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/yang-patch+xml": {
        source: "iana",
        compressible: true
      },
      "application/yin+xml": {
        source: "iana",
        compressible: true,
        extensions: ["yin"]
      },
      "application/zip": {
        source: "iana",
        compressible: false,
        extensions: ["zip"]
      },
      "application/zlib": {
        source: "iana"
      },
      "application/zstd": {
        source: "iana"
      },
      "audio/1d-interleaved-parityfec": {
        source: "iana"
      },
      "audio/32kadpcm": {
        source: "iana"
      },
      "audio/3gpp": {
        source: "iana",
        compressible: false,
        extensions: ["3gpp"]
      },
      "audio/3gpp2": {
        source: "iana"
      },
      "audio/aac": {
        source: "iana"
      },
      "audio/ac3": {
        source: "iana"
      },
      "audio/adpcm": {
        source: "apache",
        extensions: ["adp"]
      },
      "audio/amr": {
        source: "iana",
        extensions: ["amr"]
      },
      "audio/amr-wb": {
        source: "iana"
      },
      "audio/amr-wb+": {
        source: "iana"
      },
      "audio/aptx": {
        source: "iana"
      },
      "audio/asc": {
        source: "iana"
      },
      "audio/atrac-advanced-lossless": {
        source: "iana"
      },
      "audio/atrac-x": {
        source: "iana"
      },
      "audio/atrac3": {
        source: "iana"
      },
      "audio/basic": {
        source: "iana",
        compressible: false,
        extensions: ["au", "snd"]
      },
      "audio/bv16": {
        source: "iana"
      },
      "audio/bv32": {
        source: "iana"
      },
      "audio/clearmode": {
        source: "iana"
      },
      "audio/cn": {
        source: "iana"
      },
      "audio/dat12": {
        source: "iana"
      },
      "audio/dls": {
        source: "iana"
      },
      "audio/dsr-es201108": {
        source: "iana"
      },
      "audio/dsr-es202050": {
        source: "iana"
      },
      "audio/dsr-es202211": {
        source: "iana"
      },
      "audio/dsr-es202212": {
        source: "iana"
      },
      "audio/dv": {
        source: "iana"
      },
      "audio/dvi4": {
        source: "iana"
      },
      "audio/eac3": {
        source: "iana"
      },
      "audio/encaprtp": {
        source: "iana"
      },
      "audio/evrc": {
        source: "iana"
      },
      "audio/evrc-qcp": {
        source: "iana"
      },
      "audio/evrc0": {
        source: "iana"
      },
      "audio/evrc1": {
        source: "iana"
      },
      "audio/evrcb": {
        source: "iana"
      },
      "audio/evrcb0": {
        source: "iana"
      },
      "audio/evrcb1": {
        source: "iana"
      },
      "audio/evrcnw": {
        source: "iana"
      },
      "audio/evrcnw0": {
        source: "iana"
      },
      "audio/evrcnw1": {
        source: "iana"
      },
      "audio/evrcwb": {
        source: "iana"
      },
      "audio/evrcwb0": {
        source: "iana"
      },
      "audio/evrcwb1": {
        source: "iana"
      },
      "audio/evs": {
        source: "iana"
      },
      "audio/flexfec": {
        source: "iana"
      },
      "audio/fwdred": {
        source: "iana"
      },
      "audio/g711-0": {
        source: "iana"
      },
      "audio/g719": {
        source: "iana"
      },
      "audio/g722": {
        source: "iana"
      },
      "audio/g7221": {
        source: "iana"
      },
      "audio/g723": {
        source: "iana"
      },
      "audio/g726-16": {
        source: "iana"
      },
      "audio/g726-24": {
        source: "iana"
      },
      "audio/g726-32": {
        source: "iana"
      },
      "audio/g726-40": {
        source: "iana"
      },
      "audio/g728": {
        source: "iana"
      },
      "audio/g729": {
        source: "iana"
      },
      "audio/g7291": {
        source: "iana"
      },
      "audio/g729d": {
        source: "iana"
      },
      "audio/g729e": {
        source: "iana"
      },
      "audio/gsm": {
        source: "iana"
      },
      "audio/gsm-efr": {
        source: "iana"
      },
      "audio/gsm-hr-08": {
        source: "iana"
      },
      "audio/ilbc": {
        source: "iana"
      },
      "audio/ip-mr_v2.5": {
        source: "iana"
      },
      "audio/isac": {
        source: "apache"
      },
      "audio/l16": {
        source: "iana"
      },
      "audio/l20": {
        source: "iana"
      },
      "audio/l24": {
        source: "iana",
        compressible: false
      },
      "audio/l8": {
        source: "iana"
      },
      "audio/lpc": {
        source: "iana"
      },
      "audio/melp": {
        source: "iana"
      },
      "audio/melp1200": {
        source: "iana"
      },
      "audio/melp2400": {
        source: "iana"
      },
      "audio/melp600": {
        source: "iana"
      },
      "audio/mhas": {
        source: "iana"
      },
      "audio/midi": {
        source: "apache",
        extensions: ["mid", "midi", "kar", "rmi"]
      },
      "audio/mobile-xmf": {
        source: "iana",
        extensions: ["mxmf"]
      },
      "audio/mp3": {
        compressible: false,
        extensions: ["mp3"]
      },
      "audio/mp4": {
        source: "iana",
        compressible: false,
        extensions: ["m4a", "mp4a"]
      },
      "audio/mp4a-latm": {
        source: "iana"
      },
      "audio/mpa": {
        source: "iana"
      },
      "audio/mpa-robust": {
        source: "iana"
      },
      "audio/mpeg": {
        source: "iana",
        compressible: false,
        extensions: ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"]
      },
      "audio/mpeg4-generic": {
        source: "iana"
      },
      "audio/musepack": {
        source: "apache"
      },
      "audio/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["oga", "ogg", "spx", "opus"]
      },
      "audio/opus": {
        source: "iana"
      },
      "audio/parityfec": {
        source: "iana"
      },
      "audio/pcma": {
        source: "iana"
      },
      "audio/pcma-wb": {
        source: "iana"
      },
      "audio/pcmu": {
        source: "iana"
      },
      "audio/pcmu-wb": {
        source: "iana"
      },
      "audio/prs.sid": {
        source: "iana"
      },
      "audio/qcelp": {
        source: "iana"
      },
      "audio/raptorfec": {
        source: "iana"
      },
      "audio/red": {
        source: "iana"
      },
      "audio/rtp-enc-aescm128": {
        source: "iana"
      },
      "audio/rtp-midi": {
        source: "iana"
      },
      "audio/rtploopback": {
        source: "iana"
      },
      "audio/rtx": {
        source: "iana"
      },
      "audio/s3m": {
        source: "apache",
        extensions: ["s3m"]
      },
      "audio/scip": {
        source: "iana"
      },
      "audio/silk": {
        source: "apache",
        extensions: ["sil"]
      },
      "audio/smv": {
        source: "iana"
      },
      "audio/smv-qcp": {
        source: "iana"
      },
      "audio/smv0": {
        source: "iana"
      },
      "audio/sofa": {
        source: "iana"
      },
      "audio/sp-midi": {
        source: "iana"
      },
      "audio/speex": {
        source: "iana"
      },
      "audio/t140c": {
        source: "iana"
      },
      "audio/t38": {
        source: "iana"
      },
      "audio/telephone-event": {
        source: "iana"
      },
      "audio/tetra_acelp": {
        source: "iana"
      },
      "audio/tetra_acelp_bb": {
        source: "iana"
      },
      "audio/tone": {
        source: "iana"
      },
      "audio/tsvcis": {
        source: "iana"
      },
      "audio/uemclip": {
        source: "iana"
      },
      "audio/ulpfec": {
        source: "iana"
      },
      "audio/usac": {
        source: "iana"
      },
      "audio/vdvi": {
        source: "iana"
      },
      "audio/vmr-wb": {
        source: "iana"
      },
      "audio/vnd.3gpp.iufp": {
        source: "iana"
      },
      "audio/vnd.4sb": {
        source: "iana"
      },
      "audio/vnd.audiokoz": {
        source: "iana"
      },
      "audio/vnd.celp": {
        source: "iana"
      },
      "audio/vnd.cisco.nse": {
        source: "iana"
      },
      "audio/vnd.cmles.radio-events": {
        source: "iana"
      },
      "audio/vnd.cns.anp1": {
        source: "iana"
      },
      "audio/vnd.cns.inf1": {
        source: "iana"
      },
      "audio/vnd.dece.audio": {
        source: "iana",
        extensions: ["uva", "uvva"]
      },
      "audio/vnd.digital-winds": {
        source: "iana",
        extensions: ["eol"]
      },
      "audio/vnd.dlna.adts": {
        source: "iana"
      },
      "audio/vnd.dolby.heaac.1": {
        source: "iana"
      },
      "audio/vnd.dolby.heaac.2": {
        source: "iana"
      },
      "audio/vnd.dolby.mlp": {
        source: "iana"
      },
      "audio/vnd.dolby.mps": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2x": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2z": {
        source: "iana"
      },
      "audio/vnd.dolby.pulse.1": {
        source: "iana"
      },
      "audio/vnd.dra": {
        source: "iana",
        extensions: ["dra"]
      },
      "audio/vnd.dts": {
        source: "iana",
        extensions: ["dts"]
      },
      "audio/vnd.dts.hd": {
        source: "iana",
        extensions: ["dtshd"]
      },
      "audio/vnd.dts.uhd": {
        source: "iana"
      },
      "audio/vnd.dvb.file": {
        source: "iana"
      },
      "audio/vnd.everad.plj": {
        source: "iana"
      },
      "audio/vnd.hns.audio": {
        source: "iana"
      },
      "audio/vnd.lucent.voice": {
        source: "iana",
        extensions: ["lvp"]
      },
      "audio/vnd.ms-playready.media.pya": {
        source: "iana",
        extensions: ["pya"]
      },
      "audio/vnd.nokia.mobile-xmf": {
        source: "iana"
      },
      "audio/vnd.nortel.vbk": {
        source: "iana"
      },
      "audio/vnd.nuera.ecelp4800": {
        source: "iana",
        extensions: ["ecelp4800"]
      },
      "audio/vnd.nuera.ecelp7470": {
        source: "iana",
        extensions: ["ecelp7470"]
      },
      "audio/vnd.nuera.ecelp9600": {
        source: "iana",
        extensions: ["ecelp9600"]
      },
      "audio/vnd.octel.sbc": {
        source: "iana"
      },
      "audio/vnd.presonus.multitrack": {
        source: "iana"
      },
      "audio/vnd.qcelp": {
        source: "iana"
      },
      "audio/vnd.rhetorex.32kadpcm": {
        source: "iana"
      },
      "audio/vnd.rip": {
        source: "iana",
        extensions: ["rip"]
      },
      "audio/vnd.rn-realaudio": {
        compressible: false
      },
      "audio/vnd.sealedmedia.softseal.mpeg": {
        source: "iana"
      },
      "audio/vnd.vmx.cvsd": {
        source: "iana"
      },
      "audio/vnd.wave": {
        compressible: false
      },
      "audio/vorbis": {
        source: "iana",
        compressible: false
      },
      "audio/vorbis-config": {
        source: "iana"
      },
      "audio/wav": {
        compressible: false,
        extensions: ["wav"]
      },
      "audio/wave": {
        compressible: false,
        extensions: ["wav"]
      },
      "audio/webm": {
        source: "apache",
        compressible: false,
        extensions: ["weba"]
      },
      "audio/x-aac": {
        source: "apache",
        compressible: false,
        extensions: ["aac"]
      },
      "audio/x-aiff": {
        source: "apache",
        extensions: ["aif", "aiff", "aifc"]
      },
      "audio/x-caf": {
        source: "apache",
        compressible: false,
        extensions: ["caf"]
      },
      "audio/x-flac": {
        source: "apache",
        extensions: ["flac"]
      },
      "audio/x-m4a": {
        source: "nginx",
        extensions: ["m4a"]
      },
      "audio/x-matroska": {
        source: "apache",
        extensions: ["mka"]
      },
      "audio/x-mpegurl": {
        source: "apache",
        extensions: ["m3u"]
      },
      "audio/x-ms-wax": {
        source: "apache",
        extensions: ["wax"]
      },
      "audio/x-ms-wma": {
        source: "apache",
        extensions: ["wma"]
      },
      "audio/x-pn-realaudio": {
        source: "apache",
        extensions: ["ram", "ra"]
      },
      "audio/x-pn-realaudio-plugin": {
        source: "apache",
        extensions: ["rmp"]
      },
      "audio/x-realaudio": {
        source: "nginx",
        extensions: ["ra"]
      },
      "audio/x-tta": {
        source: "apache"
      },
      "audio/x-wav": {
        source: "apache",
        extensions: ["wav"]
      },
      "audio/xm": {
        source: "apache",
        extensions: ["xm"]
      },
      "chemical/x-cdx": {
        source: "apache",
        extensions: ["cdx"]
      },
      "chemical/x-cif": {
        source: "apache",
        extensions: ["cif"]
      },
      "chemical/x-cmdf": {
        source: "apache",
        extensions: ["cmdf"]
      },
      "chemical/x-cml": {
        source: "apache",
        extensions: ["cml"]
      },
      "chemical/x-csml": {
        source: "apache",
        extensions: ["csml"]
      },
      "chemical/x-pdb": {
        source: "apache"
      },
      "chemical/x-xyz": {
        source: "apache",
        extensions: ["xyz"]
      },
      "font/collection": {
        source: "iana",
        extensions: ["ttc"]
      },
      "font/otf": {
        source: "iana",
        compressible: true,
        extensions: ["otf"]
      },
      "font/sfnt": {
        source: "iana"
      },
      "font/ttf": {
        source: "iana",
        compressible: true,
        extensions: ["ttf"]
      },
      "font/woff": {
        source: "iana",
        extensions: ["woff"]
      },
      "font/woff2": {
        source: "iana",
        extensions: ["woff2"]
      },
      "image/aces": {
        source: "iana",
        extensions: ["exr"]
      },
      "image/apng": {
        compressible: false,
        extensions: ["apng"]
      },
      "image/avci": {
        source: "iana",
        extensions: ["avci"]
      },
      "image/avcs": {
        source: "iana",
        extensions: ["avcs"]
      },
      "image/avif": {
        source: "iana",
        compressible: false,
        extensions: ["avif"]
      },
      "image/bmp": {
        source: "iana",
        compressible: true,
        extensions: ["bmp"]
      },
      "image/cgm": {
        source: "iana",
        extensions: ["cgm"]
      },
      "image/dicom-rle": {
        source: "iana",
        extensions: ["drle"]
      },
      "image/emf": {
        source: "iana",
        extensions: ["emf"]
      },
      "image/fits": {
        source: "iana",
        extensions: ["fits"]
      },
      "image/g3fax": {
        source: "iana",
        extensions: ["g3"]
      },
      "image/gif": {
        source: "iana",
        compressible: false,
        extensions: ["gif"]
      },
      "image/heic": {
        source: "iana",
        extensions: ["heic"]
      },
      "image/heic-sequence": {
        source: "iana",
        extensions: ["heics"]
      },
      "image/heif": {
        source: "iana",
        extensions: ["heif"]
      },
      "image/heif-sequence": {
        source: "iana",
        extensions: ["heifs"]
      },
      "image/hej2k": {
        source: "iana",
        extensions: ["hej2"]
      },
      "image/hsj2": {
        source: "iana",
        extensions: ["hsj2"]
      },
      "image/ief": {
        source: "iana",
        extensions: ["ief"]
      },
      "image/jls": {
        source: "iana",
        extensions: ["jls"]
      },
      "image/jp2": {
        source: "iana",
        compressible: false,
        extensions: ["jp2", "jpg2"]
      },
      "image/jpeg": {
        source: "iana",
        compressible: false,
        extensions: ["jpeg", "jpg", "jpe"]
      },
      "image/jph": {
        source: "iana",
        extensions: ["jph"]
      },
      "image/jphc": {
        source: "iana",
        extensions: ["jhc"]
      },
      "image/jpm": {
        source: "iana",
        compressible: false,
        extensions: ["jpm"]
      },
      "image/jpx": {
        source: "iana",
        compressible: false,
        extensions: ["jpx", "jpf"]
      },
      "image/jxr": {
        source: "iana",
        extensions: ["jxr"]
      },
      "image/jxra": {
        source: "iana",
        extensions: ["jxra"]
      },
      "image/jxrs": {
        source: "iana",
        extensions: ["jxrs"]
      },
      "image/jxs": {
        source: "iana",
        extensions: ["jxs"]
      },
      "image/jxsc": {
        source: "iana",
        extensions: ["jxsc"]
      },
      "image/jxsi": {
        source: "iana",
        extensions: ["jxsi"]
      },
      "image/jxss": {
        source: "iana",
        extensions: ["jxss"]
      },
      "image/ktx": {
        source: "iana",
        extensions: ["ktx"]
      },
      "image/ktx2": {
        source: "iana",
        extensions: ["ktx2"]
      },
      "image/naplps": {
        source: "iana"
      },
      "image/pjpeg": {
        compressible: false
      },
      "image/png": {
        source: "iana",
        compressible: false,
        extensions: ["png"]
      },
      "image/prs.btif": {
        source: "iana",
        extensions: ["btif"]
      },
      "image/prs.pti": {
        source: "iana",
        extensions: ["pti"]
      },
      "image/pwg-raster": {
        source: "iana"
      },
      "image/sgi": {
        source: "apache",
        extensions: ["sgi"]
      },
      "image/svg+xml": {
        source: "iana",
        compressible: true,
        extensions: ["svg", "svgz"]
      },
      "image/t38": {
        source: "iana",
        extensions: ["t38"]
      },
      "image/tiff": {
        source: "iana",
        compressible: false,
        extensions: ["tif", "tiff"]
      },
      "image/tiff-fx": {
        source: "iana",
        extensions: ["tfx"]
      },
      "image/vnd.adobe.photoshop": {
        source: "iana",
        compressible: true,
        extensions: ["psd"]
      },
      "image/vnd.airzip.accelerator.azv": {
        source: "iana",
        extensions: ["azv"]
      },
      "image/vnd.cns.inf2": {
        source: "iana"
      },
      "image/vnd.dece.graphic": {
        source: "iana",
        extensions: ["uvi", "uvvi", "uvg", "uvvg"]
      },
      "image/vnd.djvu": {
        source: "iana",
        extensions: ["djvu", "djv"]
      },
      "image/vnd.dvb.subtitle": {
        source: "iana",
        extensions: ["sub"]
      },
      "image/vnd.dwg": {
        source: "iana",
        extensions: ["dwg"]
      },
      "image/vnd.dxf": {
        source: "iana",
        extensions: ["dxf"]
      },
      "image/vnd.fastbidsheet": {
        source: "iana",
        extensions: ["fbs"]
      },
      "image/vnd.fpx": {
        source: "iana",
        extensions: ["fpx"]
      },
      "image/vnd.fst": {
        source: "iana",
        extensions: ["fst"]
      },
      "image/vnd.fujixerox.edmics-mmr": {
        source: "iana",
        extensions: ["mmr"]
      },
      "image/vnd.fujixerox.edmics-rlc": {
        source: "iana",
        extensions: ["rlc"]
      },
      "image/vnd.globalgraphics.pgb": {
        source: "iana"
      },
      "image/vnd.microsoft.icon": {
        source: "iana",
        compressible: true,
        extensions: ["ico"]
      },
      "image/vnd.mix": {
        source: "iana"
      },
      "image/vnd.mozilla.apng": {
        source: "iana"
      },
      "image/vnd.ms-dds": {
        compressible: true,
        extensions: ["dds"]
      },
      "image/vnd.ms-modi": {
        source: "iana",
        extensions: ["mdi"]
      },
      "image/vnd.ms-photo": {
        source: "apache",
        extensions: ["wdp"]
      },
      "image/vnd.net-fpx": {
        source: "iana",
        extensions: ["npx"]
      },
      "image/vnd.pco.b16": {
        source: "iana",
        extensions: ["b16"]
      },
      "image/vnd.radiance": {
        source: "iana"
      },
      "image/vnd.sealed.png": {
        source: "iana"
      },
      "image/vnd.sealedmedia.softseal.gif": {
        source: "iana"
      },
      "image/vnd.sealedmedia.softseal.jpg": {
        source: "iana"
      },
      "image/vnd.svf": {
        source: "iana"
      },
      "image/vnd.tencent.tap": {
        source: "iana",
        extensions: ["tap"]
      },
      "image/vnd.valve.source.texture": {
        source: "iana",
        extensions: ["vtf"]
      },
      "image/vnd.wap.wbmp": {
        source: "iana",
        extensions: ["wbmp"]
      },
      "image/vnd.xiff": {
        source: "iana",
        extensions: ["xif"]
      },
      "image/vnd.zbrush.pcx": {
        source: "iana",
        extensions: ["pcx"]
      },
      "image/webp": {
        source: "apache",
        extensions: ["webp"]
      },
      "image/wmf": {
        source: "iana",
        extensions: ["wmf"]
      },
      "image/x-3ds": {
        source: "apache",
        extensions: ["3ds"]
      },
      "image/x-cmu-raster": {
        source: "apache",
        extensions: ["ras"]
      },
      "image/x-cmx": {
        source: "apache",
        extensions: ["cmx"]
      },
      "image/x-freehand": {
        source: "apache",
        extensions: ["fh", "fhc", "fh4", "fh5", "fh7"]
      },
      "image/x-icon": {
        source: "apache",
        compressible: true,
        extensions: ["ico"]
      },
      "image/x-jng": {
        source: "nginx",
        extensions: ["jng"]
      },
      "image/x-mrsid-image": {
        source: "apache",
        extensions: ["sid"]
      },
      "image/x-ms-bmp": {
        source: "nginx",
        compressible: true,
        extensions: ["bmp"]
      },
      "image/x-pcx": {
        source: "apache",
        extensions: ["pcx"]
      },
      "image/x-pict": {
        source: "apache",
        extensions: ["pic", "pct"]
      },
      "image/x-portable-anymap": {
        source: "apache",
        extensions: ["pnm"]
      },
      "image/x-portable-bitmap": {
        source: "apache",
        extensions: ["pbm"]
      },
      "image/x-portable-graymap": {
        source: "apache",
        extensions: ["pgm"]
      },
      "image/x-portable-pixmap": {
        source: "apache",
        extensions: ["ppm"]
      },
      "image/x-rgb": {
        source: "apache",
        extensions: ["rgb"]
      },
      "image/x-tga": {
        source: "apache",
        extensions: ["tga"]
      },
      "image/x-xbitmap": {
        source: "apache",
        extensions: ["xbm"]
      },
      "image/x-xcf": {
        compressible: false
      },
      "image/x-xpixmap": {
        source: "apache",
        extensions: ["xpm"]
      },
      "image/x-xwindowdump": {
        source: "apache",
        extensions: ["xwd"]
      },
      "message/cpim": {
        source: "iana"
      },
      "message/delivery-status": {
        source: "iana"
      },
      "message/disposition-notification": {
        source: "iana",
        extensions: [
          "disposition-notification"
        ]
      },
      "message/external-body": {
        source: "iana"
      },
      "message/feedback-report": {
        source: "iana"
      },
      "message/global": {
        source: "iana",
        extensions: ["u8msg"]
      },
      "message/global-delivery-status": {
        source: "iana",
        extensions: ["u8dsn"]
      },
      "message/global-disposition-notification": {
        source: "iana",
        extensions: ["u8mdn"]
      },
      "message/global-headers": {
        source: "iana",
        extensions: ["u8hdr"]
      },
      "message/http": {
        source: "iana",
        compressible: false
      },
      "message/imdn+xml": {
        source: "iana",
        compressible: true
      },
      "message/news": {
        source: "iana"
      },
      "message/partial": {
        source: "iana",
        compressible: false
      },
      "message/rfc822": {
        source: "iana",
        compressible: true,
        extensions: ["eml", "mime"]
      },
      "message/s-http": {
        source: "iana"
      },
      "message/sip": {
        source: "iana"
      },
      "message/sipfrag": {
        source: "iana"
      },
      "message/tracking-status": {
        source: "iana"
      },
      "message/vnd.si.simp": {
        source: "iana"
      },
      "message/vnd.wfa.wsc": {
        source: "iana",
        extensions: ["wsc"]
      },
      "model/3mf": {
        source: "iana",
        extensions: ["3mf"]
      },
      "model/e57": {
        source: "iana"
      },
      "model/gltf+json": {
        source: "iana",
        compressible: true,
        extensions: ["gltf"]
      },
      "model/gltf-binary": {
        source: "iana",
        compressible: true,
        extensions: ["glb"]
      },
      "model/iges": {
        source: "iana",
        compressible: false,
        extensions: ["igs", "iges"]
      },
      "model/mesh": {
        source: "iana",
        compressible: false,
        extensions: ["msh", "mesh", "silo"]
      },
      "model/mtl": {
        source: "iana",
        extensions: ["mtl"]
      },
      "model/obj": {
        source: "iana",
        extensions: ["obj"]
      },
      "model/step": {
        source: "iana"
      },
      "model/step+xml": {
        source: "iana",
        compressible: true,
        extensions: ["stpx"]
      },
      "model/step+zip": {
        source: "iana",
        compressible: false,
        extensions: ["stpz"]
      },
      "model/step-xml+zip": {
        source: "iana",
        compressible: false,
        extensions: ["stpxz"]
      },
      "model/stl": {
        source: "iana",
        extensions: ["stl"]
      },
      "model/vnd.collada+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dae"]
      },
      "model/vnd.dwf": {
        source: "iana",
        extensions: ["dwf"]
      },
      "model/vnd.flatland.3dml": {
        source: "iana"
      },
      "model/vnd.gdl": {
        source: "iana",
        extensions: ["gdl"]
      },
      "model/vnd.gs-gdl": {
        source: "apache"
      },
      "model/vnd.gs.gdl": {
        source: "iana"
      },
      "model/vnd.gtw": {
        source: "iana",
        extensions: ["gtw"]
      },
      "model/vnd.moml+xml": {
        source: "iana",
        compressible: true
      },
      "model/vnd.mts": {
        source: "iana",
        extensions: ["mts"]
      },
      "model/vnd.opengex": {
        source: "iana",
        extensions: ["ogex"]
      },
      "model/vnd.parasolid.transmit.binary": {
        source: "iana",
        extensions: ["x_b"]
      },
      "model/vnd.parasolid.transmit.text": {
        source: "iana",
        extensions: ["x_t"]
      },
      "model/vnd.pytha.pyox": {
        source: "iana"
      },
      "model/vnd.rosette.annotated-data-model": {
        source: "iana"
      },
      "model/vnd.sap.vds": {
        source: "iana",
        extensions: ["vds"]
      },
      "model/vnd.usdz+zip": {
        source: "iana",
        compressible: false,
        extensions: ["usdz"]
      },
      "model/vnd.valve.source.compiled-map": {
        source: "iana",
        extensions: ["bsp"]
      },
      "model/vnd.vtu": {
        source: "iana",
        extensions: ["vtu"]
      },
      "model/vrml": {
        source: "iana",
        compressible: false,
        extensions: ["wrl", "vrml"]
      },
      "model/x3d+binary": {
        source: "apache",
        compressible: false,
        extensions: ["x3db", "x3dbz"]
      },
      "model/x3d+fastinfoset": {
        source: "iana",
        extensions: ["x3db"]
      },
      "model/x3d+vrml": {
        source: "apache",
        compressible: false,
        extensions: ["x3dv", "x3dvz"]
      },
      "model/x3d+xml": {
        source: "iana",
        compressible: true,
        extensions: ["x3d", "x3dz"]
      },
      "model/x3d-vrml": {
        source: "iana",
        extensions: ["x3dv"]
      },
      "multipart/alternative": {
        source: "iana",
        compressible: false
      },
      "multipart/appledouble": {
        source: "iana"
      },
      "multipart/byteranges": {
        source: "iana"
      },
      "multipart/digest": {
        source: "iana"
      },
      "multipart/encrypted": {
        source: "iana",
        compressible: false
      },
      "multipart/form-data": {
        source: "iana",
        compressible: false
      },
      "multipart/header-set": {
        source: "iana"
      },
      "multipart/mixed": {
        source: "iana"
      },
      "multipart/multilingual": {
        source: "iana"
      },
      "multipart/parallel": {
        source: "iana"
      },
      "multipart/related": {
        source: "iana",
        compressible: false
      },
      "multipart/report": {
        source: "iana"
      },
      "multipart/signed": {
        source: "iana",
        compressible: false
      },
      "multipart/vnd.bint.med-plus": {
        source: "iana"
      },
      "multipart/voice-message": {
        source: "iana"
      },
      "multipart/x-mixed-replace": {
        source: "iana"
      },
      "text/1d-interleaved-parityfec": {
        source: "iana"
      },
      "text/cache-manifest": {
        source: "iana",
        compressible: true,
        extensions: ["appcache", "manifest"]
      },
      "text/calendar": {
        source: "iana",
        extensions: ["ics", "ifb"]
      },
      "text/calender": {
        compressible: true
      },
      "text/cmd": {
        compressible: true
      },
      "text/coffeescript": {
        extensions: ["coffee", "litcoffee"]
      },
      "text/cql": {
        source: "iana"
      },
      "text/cql-expression": {
        source: "iana"
      },
      "text/cql-identifier": {
        source: "iana"
      },
      "text/css": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["css"]
      },
      "text/csv": {
        source: "iana",
        compressible: true,
        extensions: ["csv"]
      },
      "text/csv-schema": {
        source: "iana"
      },
      "text/directory": {
        source: "iana"
      },
      "text/dns": {
        source: "iana"
      },
      "text/ecmascript": {
        source: "iana"
      },
      "text/encaprtp": {
        source: "iana"
      },
      "text/enriched": {
        source: "iana"
      },
      "text/fhirpath": {
        source: "iana"
      },
      "text/flexfec": {
        source: "iana"
      },
      "text/fwdred": {
        source: "iana"
      },
      "text/gff3": {
        source: "iana"
      },
      "text/grammar-ref-list": {
        source: "iana"
      },
      "text/html": {
        source: "iana",
        compressible: true,
        extensions: ["html", "htm", "shtml"]
      },
      "text/jade": {
        extensions: ["jade"]
      },
      "text/javascript": {
        source: "iana",
        compressible: true
      },
      "text/jcr-cnd": {
        source: "iana"
      },
      "text/jsx": {
        compressible: true,
        extensions: ["jsx"]
      },
      "text/less": {
        compressible: true,
        extensions: ["less"]
      },
      "text/markdown": {
        source: "iana",
        compressible: true,
        extensions: ["markdown", "md"]
      },
      "text/mathml": {
        source: "nginx",
        extensions: ["mml"]
      },
      "text/mdx": {
        compressible: true,
        extensions: ["mdx"]
      },
      "text/mizar": {
        source: "iana"
      },
      "text/n3": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["n3"]
      },
      "text/parameters": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/parityfec": {
        source: "iana"
      },
      "text/plain": {
        source: "iana",
        compressible: true,
        extensions: ["txt", "text", "conf", "def", "list", "log", "in", "ini"]
      },
      "text/provenance-notation": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/prs.fallenstein.rst": {
        source: "iana"
      },
      "text/prs.lines.tag": {
        source: "iana",
        extensions: ["dsc"]
      },
      "text/prs.prop.logic": {
        source: "iana"
      },
      "text/raptorfec": {
        source: "iana"
      },
      "text/red": {
        source: "iana"
      },
      "text/rfc822-headers": {
        source: "iana"
      },
      "text/richtext": {
        source: "iana",
        compressible: true,
        extensions: ["rtx"]
      },
      "text/rtf": {
        source: "iana",
        compressible: true,
        extensions: ["rtf"]
      },
      "text/rtp-enc-aescm128": {
        source: "iana"
      },
      "text/rtploopback": {
        source: "iana"
      },
      "text/rtx": {
        source: "iana"
      },
      "text/sgml": {
        source: "iana",
        extensions: ["sgml", "sgm"]
      },
      "text/shaclc": {
        source: "iana"
      },
      "text/shex": {
        source: "iana",
        extensions: ["shex"]
      },
      "text/slim": {
        extensions: ["slim", "slm"]
      },
      "text/spdx": {
        source: "iana",
        extensions: ["spdx"]
      },
      "text/strings": {
        source: "iana"
      },
      "text/stylus": {
        extensions: ["stylus", "styl"]
      },
      "text/t140": {
        source: "iana"
      },
      "text/tab-separated-values": {
        source: "iana",
        compressible: true,
        extensions: ["tsv"]
      },
      "text/troff": {
        source: "iana",
        extensions: ["t", "tr", "roff", "man", "me", "ms"]
      },
      "text/turtle": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["ttl"]
      },
      "text/ulpfec": {
        source: "iana"
      },
      "text/uri-list": {
        source: "iana",
        compressible: true,
        extensions: ["uri", "uris", "urls"]
      },
      "text/vcard": {
        source: "iana",
        compressible: true,
        extensions: ["vcard"]
      },
      "text/vnd.a": {
        source: "iana"
      },
      "text/vnd.abc": {
        source: "iana"
      },
      "text/vnd.ascii-art": {
        source: "iana"
      },
      "text/vnd.curl": {
        source: "iana",
        extensions: ["curl"]
      },
      "text/vnd.curl.dcurl": {
        source: "apache",
        extensions: ["dcurl"]
      },
      "text/vnd.curl.mcurl": {
        source: "apache",
        extensions: ["mcurl"]
      },
      "text/vnd.curl.scurl": {
        source: "apache",
        extensions: ["scurl"]
      },
      "text/vnd.debian.copyright": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.dmclientscript": {
        source: "iana"
      },
      "text/vnd.dvb.subtitle": {
        source: "iana",
        extensions: ["sub"]
      },
      "text/vnd.esmertec.theme-descriptor": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.familysearch.gedcom": {
        source: "iana",
        extensions: ["ged"]
      },
      "text/vnd.ficlab.flt": {
        source: "iana"
      },
      "text/vnd.fly": {
        source: "iana",
        extensions: ["fly"]
      },
      "text/vnd.fmi.flexstor": {
        source: "iana",
        extensions: ["flx"]
      },
      "text/vnd.gml": {
        source: "iana"
      },
      "text/vnd.graphviz": {
        source: "iana",
        extensions: ["gv"]
      },
      "text/vnd.hans": {
        source: "iana"
      },
      "text/vnd.hgl": {
        source: "iana"
      },
      "text/vnd.in3d.3dml": {
        source: "iana",
        extensions: ["3dml"]
      },
      "text/vnd.in3d.spot": {
        source: "iana",
        extensions: ["spot"]
      },
      "text/vnd.iptc.newsml": {
        source: "iana"
      },
      "text/vnd.iptc.nitf": {
        source: "iana"
      },
      "text/vnd.latex-z": {
        source: "iana"
      },
      "text/vnd.motorola.reflex": {
        source: "iana"
      },
      "text/vnd.ms-mediapackage": {
        source: "iana"
      },
      "text/vnd.net2phone.commcenter.command": {
        source: "iana"
      },
      "text/vnd.radisys.msml-basic-layout": {
        source: "iana"
      },
      "text/vnd.senx.warpscript": {
        source: "iana"
      },
      "text/vnd.si.uricatalogue": {
        source: "iana"
      },
      "text/vnd.sosi": {
        source: "iana"
      },
      "text/vnd.sun.j2me.app-descriptor": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["jad"]
      },
      "text/vnd.trolltech.linguist": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.wap.si": {
        source: "iana"
      },
      "text/vnd.wap.sl": {
        source: "iana"
      },
      "text/vnd.wap.wml": {
        source: "iana",
        extensions: ["wml"]
      },
      "text/vnd.wap.wmlscript": {
        source: "iana",
        extensions: ["wmls"]
      },
      "text/vtt": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["vtt"]
      },
      "text/x-asm": {
        source: "apache",
        extensions: ["s", "asm"]
      },
      "text/x-c": {
        source: "apache",
        extensions: ["c", "cc", "cxx", "cpp", "h", "hh", "dic"]
      },
      "text/x-component": {
        source: "nginx",
        extensions: ["htc"]
      },
      "text/x-fortran": {
        source: "apache",
        extensions: ["f", "for", "f77", "f90"]
      },
      "text/x-gwt-rpc": {
        compressible: true
      },
      "text/x-handlebars-template": {
        extensions: ["hbs"]
      },
      "text/x-java-source": {
        source: "apache",
        extensions: ["java"]
      },
      "text/x-jquery-tmpl": {
        compressible: true
      },
      "text/x-lua": {
        extensions: ["lua"]
      },
      "text/x-markdown": {
        compressible: true,
        extensions: ["mkd"]
      },
      "text/x-nfo": {
        source: "apache",
        extensions: ["nfo"]
      },
      "text/x-opml": {
        source: "apache",
        extensions: ["opml"]
      },
      "text/x-org": {
        compressible: true,
        extensions: ["org"]
      },
      "text/x-pascal": {
        source: "apache",
        extensions: ["p", "pas"]
      },
      "text/x-processing": {
        compressible: true,
        extensions: ["pde"]
      },
      "text/x-sass": {
        extensions: ["sass"]
      },
      "text/x-scss": {
        extensions: ["scss"]
      },
      "text/x-setext": {
        source: "apache",
        extensions: ["etx"]
      },
      "text/x-sfv": {
        source: "apache",
        extensions: ["sfv"]
      },
      "text/x-suse-ymp": {
        compressible: true,
        extensions: ["ymp"]
      },
      "text/x-uuencode": {
        source: "apache",
        extensions: ["uu"]
      },
      "text/x-vcalendar": {
        source: "apache",
        extensions: ["vcs"]
      },
      "text/x-vcard": {
        source: "apache",
        extensions: ["vcf"]
      },
      "text/xml": {
        source: "iana",
        compressible: true,
        extensions: ["xml"]
      },
      "text/xml-external-parsed-entity": {
        source: "iana"
      },
      "text/yaml": {
        compressible: true,
        extensions: ["yaml", "yml"]
      },
      "video/1d-interleaved-parityfec": {
        source: "iana"
      },
      "video/3gpp": {
        source: "iana",
        extensions: ["3gp", "3gpp"]
      },
      "video/3gpp-tt": {
        source: "iana"
      },
      "video/3gpp2": {
        source: "iana",
        extensions: ["3g2"]
      },
      "video/av1": {
        source: "iana"
      },
      "video/bmpeg": {
        source: "iana"
      },
      "video/bt656": {
        source: "iana"
      },
      "video/celb": {
        source: "iana"
      },
      "video/dv": {
        source: "iana"
      },
      "video/encaprtp": {
        source: "iana"
      },
      "video/ffv1": {
        source: "iana"
      },
      "video/flexfec": {
        source: "iana"
      },
      "video/h261": {
        source: "iana",
        extensions: ["h261"]
      },
      "video/h263": {
        source: "iana",
        extensions: ["h263"]
      },
      "video/h263-1998": {
        source: "iana"
      },
      "video/h263-2000": {
        source: "iana"
      },
      "video/h264": {
        source: "iana",
        extensions: ["h264"]
      },
      "video/h264-rcdo": {
        source: "iana"
      },
      "video/h264-svc": {
        source: "iana"
      },
      "video/h265": {
        source: "iana"
      },
      "video/iso.segment": {
        source: "iana",
        extensions: ["m4s"]
      },
      "video/jpeg": {
        source: "iana",
        extensions: ["jpgv"]
      },
      "video/jpeg2000": {
        source: "iana"
      },
      "video/jpm": {
        source: "apache",
        extensions: ["jpm", "jpgm"]
      },
      "video/jxsv": {
        source: "iana"
      },
      "video/mj2": {
        source: "iana",
        extensions: ["mj2", "mjp2"]
      },
      "video/mp1s": {
        source: "iana"
      },
      "video/mp2p": {
        source: "iana"
      },
      "video/mp2t": {
        source: "iana",
        extensions: ["ts"]
      },
      "video/mp4": {
        source: "iana",
        compressible: false,
        extensions: ["mp4", "mp4v", "mpg4"]
      },
      "video/mp4v-es": {
        source: "iana"
      },
      "video/mpeg": {
        source: "iana",
        compressible: false,
        extensions: ["mpeg", "mpg", "mpe", "m1v", "m2v"]
      },
      "video/mpeg4-generic": {
        source: "iana"
      },
      "video/mpv": {
        source: "iana"
      },
      "video/nv": {
        source: "iana"
      },
      "video/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["ogv"]
      },
      "video/parityfec": {
        source: "iana"
      },
      "video/pointer": {
        source: "iana"
      },
      "video/quicktime": {
        source: "iana",
        compressible: false,
        extensions: ["qt", "mov"]
      },
      "video/raptorfec": {
        source: "iana"
      },
      "video/raw": {
        source: "iana"
      },
      "video/rtp-enc-aescm128": {
        source: "iana"
      },
      "video/rtploopback": {
        source: "iana"
      },
      "video/rtx": {
        source: "iana"
      },
      "video/scip": {
        source: "iana"
      },
      "video/smpte291": {
        source: "iana"
      },
      "video/smpte292m": {
        source: "iana"
      },
      "video/ulpfec": {
        source: "iana"
      },
      "video/vc1": {
        source: "iana"
      },
      "video/vc2": {
        source: "iana"
      },
      "video/vnd.cctv": {
        source: "iana"
      },
      "video/vnd.dece.hd": {
        source: "iana",
        extensions: ["uvh", "uvvh"]
      },
      "video/vnd.dece.mobile": {
        source: "iana",
        extensions: ["uvm", "uvvm"]
      },
      "video/vnd.dece.mp4": {
        source: "iana"
      },
      "video/vnd.dece.pd": {
        source: "iana",
        extensions: ["uvp", "uvvp"]
      },
      "video/vnd.dece.sd": {
        source: "iana",
        extensions: ["uvs", "uvvs"]
      },
      "video/vnd.dece.video": {
        source: "iana",
        extensions: ["uvv", "uvvv"]
      },
      "video/vnd.directv.mpeg": {
        source: "iana"
      },
      "video/vnd.directv.mpeg-tts": {
        source: "iana"
      },
      "video/vnd.dlna.mpeg-tts": {
        source: "iana"
      },
      "video/vnd.dvb.file": {
        source: "iana",
        extensions: ["dvb"]
      },
      "video/vnd.fvt": {
        source: "iana",
        extensions: ["fvt"]
      },
      "video/vnd.hns.video": {
        source: "iana"
      },
      "video/vnd.iptvforum.1dparityfec-1010": {
        source: "iana"
      },
      "video/vnd.iptvforum.1dparityfec-2005": {
        source: "iana"
      },
      "video/vnd.iptvforum.2dparityfec-1010": {
        source: "iana"
      },
      "video/vnd.iptvforum.2dparityfec-2005": {
        source: "iana"
      },
      "video/vnd.iptvforum.ttsavc": {
        source: "iana"
      },
      "video/vnd.iptvforum.ttsmpeg2": {
        source: "iana"
      },
      "video/vnd.motorola.video": {
        source: "iana"
      },
      "video/vnd.motorola.videop": {
        source: "iana"
      },
      "video/vnd.mpegurl": {
        source: "iana",
        extensions: ["mxu", "m4u"]
      },
      "video/vnd.ms-playready.media.pyv": {
        source: "iana",
        extensions: ["pyv"]
      },
      "video/vnd.nokia.interleaved-multimedia": {
        source: "iana"
      },
      "video/vnd.nokia.mp4vr": {
        source: "iana"
      },
      "video/vnd.nokia.videovoip": {
        source: "iana"
      },
      "video/vnd.objectvideo": {
        source: "iana"
      },
      "video/vnd.radgamettools.bink": {
        source: "iana"
      },
      "video/vnd.radgamettools.smacker": {
        source: "iana"
      },
      "video/vnd.sealed.mpeg1": {
        source: "iana"
      },
      "video/vnd.sealed.mpeg4": {
        source: "iana"
      },
      "video/vnd.sealed.swf": {
        source: "iana"
      },
      "video/vnd.sealedmedia.softseal.mov": {
        source: "iana"
      },
      "video/vnd.uvvu.mp4": {
        source: "iana",
        extensions: ["uvu", "uvvu"]
      },
      "video/vnd.vivo": {
        source: "iana",
        extensions: ["viv"]
      },
      "video/vnd.youtube.yt": {
        source: "iana"
      },
      "video/vp8": {
        source: "iana"
      },
      "video/vp9": {
        source: "iana"
      },
      "video/webm": {
        source: "apache",
        compressible: false,
        extensions: ["webm"]
      },
      "video/x-f4v": {
        source: "apache",
        extensions: ["f4v"]
      },
      "video/x-fli": {
        source: "apache",
        extensions: ["fli"]
      },
      "video/x-flv": {
        source: "apache",
        compressible: false,
        extensions: ["flv"]
      },
      "video/x-m4v": {
        source: "apache",
        extensions: ["m4v"]
      },
      "video/x-matroska": {
        source: "apache",
        compressible: false,
        extensions: ["mkv", "mk3d", "mks"]
      },
      "video/x-mng": {
        source: "apache",
        extensions: ["mng"]
      },
      "video/x-ms-asf": {
        source: "apache",
        extensions: ["asf", "asx"]
      },
      "video/x-ms-vob": {
        source: "apache",
        extensions: ["vob"]
      },
      "video/x-ms-wm": {
        source: "apache",
        extensions: ["wm"]
      },
      "video/x-ms-wmv": {
        source: "apache",
        compressible: false,
        extensions: ["wmv"]
      },
      "video/x-ms-wmx": {
        source: "apache",
        extensions: ["wmx"]
      },
      "video/x-ms-wvx": {
        source: "apache",
        extensions: ["wvx"]
      },
      "video/x-msvideo": {
        source: "apache",
        extensions: ["avi"]
      },
      "video/x-sgi-movie": {
        source: "apache",
        extensions: ["movie"]
      },
      "video/x-smv": {
        source: "apache",
        extensions: ["smv"]
      },
      "x-conference/x-cooltalk": {
        source: "apache",
        extensions: ["ice"]
      },
      "x-shader/x-fragment": {
        compressible: true
      },
      "x-shader/x-vertex": {
        compressible: true
      }
    };
  }
});

// node_modules/mime-db/index.js
var require_mime_db = __commonJS({
  "node_modules/mime-db/index.js"(exports2, module2) {
    module2.exports = require_db();
  }
});

// node_modules/mime-types/index.js
var require_mime_types = __commonJS({
  "node_modules/mime-types/index.js"(exports2) {
    "use strict";
    var db = require_mime_db();
    var extname = require("path").extname;
    var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;
    var TEXT_TYPE_REGEXP = /^text\//i;
    exports2.charset = charset;
    exports2.charsets = { lookup: charset };
    exports2.contentType = contentType;
    exports2.extension = extension;
    exports2.extensions = /* @__PURE__ */ Object.create(null);
    exports2.lookup = lookup;
    exports2.types = /* @__PURE__ */ Object.create(null);
    populateMaps(exports2.extensions, exports2.types);
    function charset(type) {
      if (!type || typeof type !== "string") {
        return false;
      }
      var match = EXTRACT_TYPE_REGEXP.exec(type);
      var mime = match && db[match[1].toLowerCase()];
      if (mime && mime.charset) {
        return mime.charset;
      }
      if (match && TEXT_TYPE_REGEXP.test(match[1])) {
        return "UTF-8";
      }
      return false;
    }
    function contentType(str) {
      if (!str || typeof str !== "string") {
        return false;
      }
      var mime = str.indexOf("/") === -1 ? exports2.lookup(str) : str;
      if (!mime) {
        return false;
      }
      if (mime.indexOf("charset") === -1) {
        var charset2 = exports2.charset(mime);
        if (charset2) mime += "; charset=" + charset2.toLowerCase();
      }
      return mime;
    }
    function extension(type) {
      if (!type || typeof type !== "string") {
        return false;
      }
      var match = EXTRACT_TYPE_REGEXP.exec(type);
      var exts = match && exports2.extensions[match[1].toLowerCase()];
      if (!exts || !exts.length) {
        return false;
      }
      return exts[0];
    }
    function lookup(path) {
      if (!path || typeof path !== "string") {
        return false;
      }
      var extension2 = extname("x." + path).toLowerCase().substr(1);
      if (!extension2) {
        return false;
      }
      return exports2.types[extension2] || false;
    }
    function populateMaps(extensions, types) {
      var preference = ["nginx", "apache", void 0, "iana"];
      Object.keys(db).forEach(function forEachMimeType(type) {
        var mime = db[type];
        var exts = mime.extensions;
        if (!exts || !exts.length) {
          return;
        }
        extensions[type] = exts;
        for (var i = 0; i < exts.length; i++) {
          var extension2 = exts[i];
          if (types[extension2]) {
            var from = preference.indexOf(db[types[extension2]].source);
            var to = preference.indexOf(mime.source);
            if (types[extension2] !== "application/octet-stream" && (from > to || from === to && types[extension2].substr(0, 12) === "application/")) {
              continue;
            }
          }
          types[extension2] = type;
        }
      });
    }
  }
});

// node_modules/asynckit/lib/defer.js
var require_defer = __commonJS({
  "node_modules/asynckit/lib/defer.js"(exports2, module2) {
    module2.exports = defer;
    function defer(fn) {
      var nextTick = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
      if (nextTick) {
        nextTick(fn);
      } else {
        setTimeout(fn, 0);
      }
    }
  }
});

// node_modules/asynckit/lib/async.js
var require_async = __commonJS({
  "node_modules/asynckit/lib/async.js"(exports2, module2) {
    var defer = require_defer();
    module2.exports = async;
    function async(callback) {
      var isAsync = false;
      defer(function() {
        isAsync = true;
      });
      return function async_callback(err, result) {
        if (isAsync) {
          callback(err, result);
        } else {
          defer(function nextTick_callback() {
            callback(err, result);
          });
        }
      };
    }
  }
});

// node_modules/asynckit/lib/abort.js
var require_abort = __commonJS({
  "node_modules/asynckit/lib/abort.js"(exports2, module2) {
    module2.exports = abort;
    function abort(state) {
      Object.keys(state.jobs).forEach(clean.bind(state));
      state.jobs = {};
    }
    function clean(key) {
      if (typeof this.jobs[key] == "function") {
        this.jobs[key]();
      }
    }
  }
});

// node_modules/asynckit/lib/iterate.js
var require_iterate = __commonJS({
  "node_modules/asynckit/lib/iterate.js"(exports2, module2) {
    var async = require_async();
    var abort = require_abort();
    module2.exports = iterate;
    function iterate(list, iterator2, state, callback) {
      var key = state["keyedList"] ? state["keyedList"][state.index] : state.index;
      state.jobs[key] = runJob(iterator2, key, list[key], function(error, output) {
        if (!(key in state.jobs)) {
          return;
        }
        delete state.jobs[key];
        if (error) {
          abort(state);
        } else {
          state.results[key] = output;
        }
        callback(error, state.results);
      });
    }
    function runJob(iterator2, key, item, callback) {
      var aborter;
      if (iterator2.length == 2) {
        aborter = iterator2(item, async(callback));
      } else {
        aborter = iterator2(item, key, async(callback));
      }
      return aborter;
    }
  }
});

// node_modules/asynckit/lib/state.js
var require_state = __commonJS({
  "node_modules/asynckit/lib/state.js"(exports2, module2) {
    module2.exports = state;
    function state(list, sortMethod) {
      var isNamedList = !Array.isArray(list), initState = {
        index: 0,
        keyedList: isNamedList || sortMethod ? Object.keys(list) : null,
        jobs: {},
        results: isNamedList ? {} : [],
        size: isNamedList ? Object.keys(list).length : list.length
      };
      if (sortMethod) {
        initState.keyedList.sort(isNamedList ? sortMethod : function(a, b) {
          return sortMethod(list[a], list[b]);
        });
      }
      return initState;
    }
  }
});

// node_modules/asynckit/lib/terminator.js
var require_terminator = __commonJS({
  "node_modules/asynckit/lib/terminator.js"(exports2, module2) {
    var abort = require_abort();
    var async = require_async();
    module2.exports = terminator;
    function terminator(callback) {
      if (!Object.keys(this.jobs).length) {
        return;
      }
      this.index = this.size;
      abort(this);
      async(callback)(null, this.results);
    }
  }
});

// node_modules/asynckit/parallel.js
var require_parallel = __commonJS({
  "node_modules/asynckit/parallel.js"(exports2, module2) {
    var iterate = require_iterate();
    var initState = require_state();
    var terminator = require_terminator();
    module2.exports = parallel;
    function parallel(list, iterator2, callback) {
      var state = initState(list);
      while (state.index < (state["keyedList"] || list).length) {
        iterate(list, iterator2, state, function(error, result) {
          if (error) {
            callback(error, result);
            return;
          }
          if (Object.keys(state.jobs).length === 0) {
            callback(null, state.results);
            return;
          }
        });
        state.index++;
      }
      return terminator.bind(state, callback);
    }
  }
});

// node_modules/asynckit/serialOrdered.js
var require_serialOrdered = __commonJS({
  "node_modules/asynckit/serialOrdered.js"(exports2, module2) {
    var iterate = require_iterate();
    var initState = require_state();
    var terminator = require_terminator();
    module2.exports = serialOrdered;
    module2.exports.ascending = ascending;
    module2.exports.descending = descending;
    function serialOrdered(list, iterator2, sortMethod, callback) {
      var state = initState(list, sortMethod);
      iterate(list, iterator2, state, function iteratorHandler(error, result) {
        if (error) {
          callback(error, result);
          return;
        }
        state.index++;
        if (state.index < (state["keyedList"] || list).length) {
          iterate(list, iterator2, state, iteratorHandler);
          return;
        }
        callback(null, state.results);
      });
      return terminator.bind(state, callback);
    }
    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    function descending(a, b) {
      return -1 * ascending(a, b);
    }
  }
});

// node_modules/asynckit/serial.js
var require_serial = __commonJS({
  "node_modules/asynckit/serial.js"(exports2, module2) {
    var serialOrdered = require_serialOrdered();
    module2.exports = serial;
    function serial(list, iterator2, callback) {
      return serialOrdered(list, iterator2, null, callback);
    }
  }
});

// node_modules/asynckit/index.js
var require_asynckit = __commonJS({
  "node_modules/asynckit/index.js"(exports2, module2) {
    module2.exports = {
      parallel: require_parallel(),
      serial: require_serial(),
      serialOrdered: require_serialOrdered()
    };
  }
});

// node_modules/es-object-atoms/index.js
var require_es_object_atoms = __commonJS({
  "node_modules/es-object-atoms/index.js"(exports2, module2) {
    "use strict";
    module2.exports = Object;
  }
});

// node_modules/es-errors/index.js
var require_es_errors = __commonJS({
  "node_modules/es-errors/index.js"(exports2, module2) {
    "use strict";
    module2.exports = Error;
  }
});

// node_modules/es-errors/eval.js
var require_eval = __commonJS({
  "node_modules/es-errors/eval.js"(exports2, module2) {
    "use strict";
    module2.exports = EvalError;
  }
});

// node_modules/es-errors/range.js
var require_range = __commonJS({
  "node_modules/es-errors/range.js"(exports2, module2) {
    "use strict";
    module2.exports = RangeError;
  }
});

// node_modules/es-errors/ref.js
var require_ref = __commonJS({
  "node_modules/es-errors/ref.js"(exports2, module2) {
    "use strict";
    module2.exports = ReferenceError;
  }
});

// node_modules/es-errors/syntax.js
var require_syntax = __commonJS({
  "node_modules/es-errors/syntax.js"(exports2, module2) {
    "use strict";
    module2.exports = SyntaxError;
  }
});

// node_modules/es-errors/type.js
var require_type = __commonJS({
  "node_modules/es-errors/type.js"(exports2, module2) {
    "use strict";
    module2.exports = TypeError;
  }
});

// node_modules/es-errors/uri.js
var require_uri = __commonJS({
  "node_modules/es-errors/uri.js"(exports2, module2) {
    "use strict";
    module2.exports = URIError;
  }
});

// node_modules/math-intrinsics/abs.js
var require_abs = __commonJS({
  "node_modules/math-intrinsics/abs.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.abs;
  }
});

// node_modules/math-intrinsics/floor.js
var require_floor = __commonJS({
  "node_modules/math-intrinsics/floor.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.floor;
  }
});

// node_modules/math-intrinsics/max.js
var require_max = __commonJS({
  "node_modules/math-intrinsics/max.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.max;
  }
});

// node_modules/math-intrinsics/min.js
var require_min = __commonJS({
  "node_modules/math-intrinsics/min.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.min;
  }
});

// node_modules/math-intrinsics/pow.js
var require_pow = __commonJS({
  "node_modules/math-intrinsics/pow.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.pow;
  }
});

// node_modules/math-intrinsics/round.js
var require_round = __commonJS({
  "node_modules/math-intrinsics/round.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.round;
  }
});

// node_modules/math-intrinsics/isNaN.js
var require_isNaN = __commonJS({
  "node_modules/math-intrinsics/isNaN.js"(exports2, module2) {
    "use strict";
    module2.exports = Number.isNaN || function isNaN2(a) {
      return a !== a;
    };
  }
});

// node_modules/math-intrinsics/sign.js
var require_sign = __commonJS({
  "node_modules/math-intrinsics/sign.js"(exports2, module2) {
    "use strict";
    var $isNaN = require_isNaN();
    module2.exports = function sign(number) {
      if ($isNaN(number) || number === 0) {
        return number;
      }
      return number < 0 ? -1 : 1;
    };
  }
});

// node_modules/gopd/gOPD.js
var require_gOPD = __commonJS({
  "node_modules/gopd/gOPD.js"(exports2, module2) {
    "use strict";
    module2.exports = Object.getOwnPropertyDescriptor;
  }
});

// node_modules/gopd/index.js
var require_gopd = __commonJS({
  "node_modules/gopd/index.js"(exports2, module2) {
    "use strict";
    var $gOPD = require_gOPD();
    if ($gOPD) {
      try {
        $gOPD([], "length");
      } catch (e) {
        $gOPD = null;
      }
    }
    module2.exports = $gOPD;
  }
});

// node_modules/es-define-property/index.js
var require_es_define_property = __commonJS({
  "node_modules/es-define-property/index.js"(exports2, module2) {
    "use strict";
    var $defineProperty = Object.defineProperty || false;
    if ($defineProperty) {
      try {
        $defineProperty({}, "a", { value: 1 });
      } catch (e) {
        $defineProperty = false;
      }
    }
    module2.exports = $defineProperty;
  }
});

// node_modules/has-symbols/shams.js
var require_shams = __commonJS({
  "node_modules/has-symbols/shams.js"(exports2, module2) {
    "use strict";
    module2.exports = function hasSymbols() {
      if (typeof Symbol !== "function" || typeof Object.getOwnPropertySymbols !== "function") {
        return false;
      }
      if (typeof Symbol.iterator === "symbol") {
        return true;
      }
      var obj = {};
      var sym = Symbol("test");
      var symObj = Object(sym);
      if (typeof sym === "string") {
        return false;
      }
      if (Object.prototype.toString.call(sym) !== "[object Symbol]") {
        return false;
      }
      if (Object.prototype.toString.call(symObj) !== "[object Symbol]") {
        return false;
      }
      var symVal = 42;
      obj[sym] = symVal;
      for (var _ in obj) {
        return false;
      }
      if (typeof Object.keys === "function" && Object.keys(obj).length !== 0) {
        return false;
      }
      if (typeof Object.getOwnPropertyNames === "function" && Object.getOwnPropertyNames(obj).length !== 0) {
        return false;
      }
      var syms = Object.getOwnPropertySymbols(obj);
      if (syms.length !== 1 || syms[0] !== sym) {
        return false;
      }
      if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) {
        return false;
      }
      if (typeof Object.getOwnPropertyDescriptor === "function") {
        var descriptor = (
          /** @type {PropertyDescriptor} */
          Object.getOwnPropertyDescriptor(obj, sym)
        );
        if (descriptor.value !== symVal || descriptor.enumerable !== true) {
          return false;
        }
      }
      return true;
    };
  }
});

// node_modules/has-symbols/index.js
var require_has_symbols = __commonJS({
  "node_modules/has-symbols/index.js"(exports2, module2) {
    "use strict";
    var origSymbol = typeof Symbol !== "undefined" && Symbol;
    var hasSymbolSham = require_shams();
    module2.exports = function hasNativeSymbols() {
      if (typeof origSymbol !== "function") {
        return false;
      }
      if (typeof Symbol !== "function") {
        return false;
      }
      if (typeof origSymbol("foo") !== "symbol") {
        return false;
      }
      if (typeof Symbol("bar") !== "symbol") {
        return false;
      }
      return hasSymbolSham();
    };
  }
});

// node_modules/get-proto/Reflect.getPrototypeOf.js
var require_Reflect_getPrototypeOf = __commonJS({
  "node_modules/get-proto/Reflect.getPrototypeOf.js"(exports2, module2) {
    "use strict";
    module2.exports = typeof Reflect !== "undefined" && Reflect.getPrototypeOf || null;
  }
});

// node_modules/get-proto/Object.getPrototypeOf.js
var require_Object_getPrototypeOf = __commonJS({
  "node_modules/get-proto/Object.getPrototypeOf.js"(exports2, module2) {
    "use strict";
    var $Object = require_es_object_atoms();
    module2.exports = $Object.getPrototypeOf || null;
  }
});

// node_modules/function-bind/implementation.js
var require_implementation = __commonJS({
  "node_modules/function-bind/implementation.js"(exports2, module2) {
    "use strict";
    var ERROR_MESSAGE = "Function.prototype.bind called on incompatible ";
    var toStr = Object.prototype.toString;
    var max = Math.max;
    var funcType = "[object Function]";
    var concatty = function concatty2(a, b) {
      var arr = [];
      for (var i = 0; i < a.length; i += 1) {
        arr[i] = a[i];
      }
      for (var j = 0; j < b.length; j += 1) {
        arr[j + a.length] = b[j];
      }
      return arr;
    };
    var slicy = function slicy2(arrLike, offset) {
      var arr = [];
      for (var i = offset || 0, j = 0; i < arrLike.length; i += 1, j += 1) {
        arr[j] = arrLike[i];
      }
      return arr;
    };
    var joiny = function(arr, joiner) {
      var str = "";
      for (var i = 0; i < arr.length; i += 1) {
        str += arr[i];
        if (i + 1 < arr.length) {
          str += joiner;
        }
      }
      return str;
    };
    module2.exports = function bind2(that) {
      var target = this;
      if (typeof target !== "function" || toStr.apply(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
      }
      var args = slicy(arguments, 1);
      var bound;
      var binder = function() {
        if (this instanceof bound) {
          var result = target.apply(
            this,
            concatty(args, arguments)
          );
          if (Object(result) === result) {
            return result;
          }
          return this;
        }
        return target.apply(
          that,
          concatty(args, arguments)
        );
      };
      var boundLength = max(0, target.length - args.length);
      var boundArgs = [];
      for (var i = 0; i < boundLength; i++) {
        boundArgs[i] = "$" + i;
      }
      bound = Function("binder", "return function (" + joiny(boundArgs, ",") + "){ return binder.apply(this,arguments); }")(binder);
      if (target.prototype) {
        var Empty = function Empty2() {
        };
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
      }
      return bound;
    };
  }
});

// node_modules/function-bind/index.js
var require_function_bind = __commonJS({
  "node_modules/function-bind/index.js"(exports2, module2) {
    "use strict";
    var implementation = require_implementation();
    module2.exports = Function.prototype.bind || implementation;
  }
});

// node_modules/call-bind-apply-helpers/functionCall.js
var require_functionCall = __commonJS({
  "node_modules/call-bind-apply-helpers/functionCall.js"(exports2, module2) {
    "use strict";
    module2.exports = Function.prototype.call;
  }
});

// node_modules/call-bind-apply-helpers/functionApply.js
var require_functionApply = __commonJS({
  "node_modules/call-bind-apply-helpers/functionApply.js"(exports2, module2) {
    "use strict";
    module2.exports = Function.prototype.apply;
  }
});

// node_modules/call-bind-apply-helpers/reflectApply.js
var require_reflectApply = __commonJS({
  "node_modules/call-bind-apply-helpers/reflectApply.js"(exports2, module2) {
    "use strict";
    module2.exports = typeof Reflect !== "undefined" && Reflect && Reflect.apply;
  }
});

// node_modules/call-bind-apply-helpers/actualApply.js
var require_actualApply = __commonJS({
  "node_modules/call-bind-apply-helpers/actualApply.js"(exports2, module2) {
    "use strict";
    var bind2 = require_function_bind();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var $reflectApply = require_reflectApply();
    module2.exports = $reflectApply || bind2.call($call, $apply);
  }
});

// node_modules/call-bind-apply-helpers/index.js
var require_call_bind_apply_helpers = __commonJS({
  "node_modules/call-bind-apply-helpers/index.js"(exports2, module2) {
    "use strict";
    var bind2 = require_function_bind();
    var $TypeError = require_type();
    var $call = require_functionCall();
    var $actualApply = require_actualApply();
    module2.exports = function callBindBasic(args) {
      if (args.length < 1 || typeof args[0] !== "function") {
        throw new $TypeError("a function is required");
      }
      return $actualApply(bind2, $call, args);
    };
  }
});

// node_modules/dunder-proto/get.js
var require_get = __commonJS({
  "node_modules/dunder-proto/get.js"(exports2, module2) {
    "use strict";
    var callBind = require_call_bind_apply_helpers();
    var gOPD = require_gopd();
    var hasProtoAccessor;
    try {
      hasProtoAccessor = /** @type {{ __proto__?: typeof Array.prototype }} */
      [].__proto__ === Array.prototype;
    } catch (e) {
      if (!e || typeof e !== "object" || !("code" in e) || e.code !== "ERR_PROTO_ACCESS") {
        throw e;
      }
    }
    var desc = !!hasProtoAccessor && gOPD && gOPD(
      Object.prototype,
      /** @type {keyof typeof Object.prototype} */
      "__proto__"
    );
    var $Object = Object;
    var $getPrototypeOf = $Object.getPrototypeOf;
    module2.exports = desc && typeof desc.get === "function" ? callBind([desc.get]) : typeof $getPrototypeOf === "function" ? (
      /** @type {import('./get')} */
      function getDunder(value) {
        return $getPrototypeOf(value == null ? value : $Object(value));
      }
    ) : false;
  }
});

// node_modules/get-proto/index.js
var require_get_proto = __commonJS({
  "node_modules/get-proto/index.js"(exports2, module2) {
    "use strict";
    var reflectGetProto = require_Reflect_getPrototypeOf();
    var originalGetProto = require_Object_getPrototypeOf();
    var getDunderProto = require_get();
    module2.exports = reflectGetProto ? function getProto(O) {
      return reflectGetProto(O);
    } : originalGetProto ? function getProto(O) {
      if (!O || typeof O !== "object" && typeof O !== "function") {
        throw new TypeError("getProto: not an object");
      }
      return originalGetProto(O);
    } : getDunderProto ? function getProto(O) {
      return getDunderProto(O);
    } : null;
  }
});

// node_modules/hasown/index.js
var require_hasown = __commonJS({
  "node_modules/hasown/index.js"(exports2, module2) {
    "use strict";
    var call = Function.prototype.call;
    var $hasOwn = Object.prototype.hasOwnProperty;
    var bind2 = require_function_bind();
    module2.exports = bind2.call(call, $hasOwn);
  }
});

// node_modules/get-intrinsic/index.js
var require_get_intrinsic = __commonJS({
  "node_modules/get-intrinsic/index.js"(exports2, module2) {
    "use strict";
    var undefined2;
    var $Object = require_es_object_atoms();
    var $Error = require_es_errors();
    var $EvalError = require_eval();
    var $RangeError = require_range();
    var $ReferenceError = require_ref();
    var $SyntaxError = require_syntax();
    var $TypeError = require_type();
    var $URIError = require_uri();
    var abs = require_abs();
    var floor = require_floor();
    var max = require_max();
    var min = require_min();
    var pow = require_pow();
    var round = require_round();
    var sign = require_sign();
    var $Function = Function;
    var getEvalledConstructor = function(expressionSyntax) {
      try {
        return $Function('"use strict"; return (' + expressionSyntax + ").constructor;")();
      } catch (e) {
      }
    };
    var $gOPD = require_gopd();
    var $defineProperty = require_es_define_property();
    var throwTypeError = function() {
      throw new $TypeError();
    };
    var ThrowTypeError = $gOPD ? function() {
      try {
        arguments.callee;
        return throwTypeError;
      } catch (calleeThrows) {
        try {
          return $gOPD(arguments, "callee").get;
        } catch (gOPDthrows) {
          return throwTypeError;
        }
      }
    }() : throwTypeError;
    var hasSymbols = require_has_symbols()();
    var getProto = require_get_proto();
    var $ObjectGPO = require_Object_getPrototypeOf();
    var $ReflectGPO = require_Reflect_getPrototypeOf();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var needsEval = {};
    var TypedArray = typeof Uint8Array === "undefined" || !getProto ? undefined2 : getProto(Uint8Array);
    var INTRINSICS = {
      __proto__: null,
      "%AggregateError%": typeof AggregateError === "undefined" ? undefined2 : AggregateError,
      "%Array%": Array,
      "%ArrayBuffer%": typeof ArrayBuffer === "undefined" ? undefined2 : ArrayBuffer,
      "%ArrayIteratorPrototype%": hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined2,
      "%AsyncFromSyncIteratorPrototype%": undefined2,
      "%AsyncFunction%": needsEval,
      "%AsyncGenerator%": needsEval,
      "%AsyncGeneratorFunction%": needsEval,
      "%AsyncIteratorPrototype%": needsEval,
      "%Atomics%": typeof Atomics === "undefined" ? undefined2 : Atomics,
      "%BigInt%": typeof BigInt === "undefined" ? undefined2 : BigInt,
      "%BigInt64Array%": typeof BigInt64Array === "undefined" ? undefined2 : BigInt64Array,
      "%BigUint64Array%": typeof BigUint64Array === "undefined" ? undefined2 : BigUint64Array,
      "%Boolean%": Boolean,
      "%DataView%": typeof DataView === "undefined" ? undefined2 : DataView,
      "%Date%": Date,
      "%decodeURI%": decodeURI,
      "%decodeURIComponent%": decodeURIComponent,
      "%encodeURI%": encodeURI,
      "%encodeURIComponent%": encodeURIComponent,
      "%Error%": $Error,
      "%eval%": eval,
      // eslint-disable-line no-eval
      "%EvalError%": $EvalError,
      "%Float16Array%": typeof Float16Array === "undefined" ? undefined2 : Float16Array,
      "%Float32Array%": typeof Float32Array === "undefined" ? undefined2 : Float32Array,
      "%Float64Array%": typeof Float64Array === "undefined" ? undefined2 : Float64Array,
      "%FinalizationRegistry%": typeof FinalizationRegistry === "undefined" ? undefined2 : FinalizationRegistry,
      "%Function%": $Function,
      "%GeneratorFunction%": needsEval,
      "%Int8Array%": typeof Int8Array === "undefined" ? undefined2 : Int8Array,
      "%Int16Array%": typeof Int16Array === "undefined" ? undefined2 : Int16Array,
      "%Int32Array%": typeof Int32Array === "undefined" ? undefined2 : Int32Array,
      "%isFinite%": isFinite,
      "%isNaN%": isNaN,
      "%IteratorPrototype%": hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined2,
      "%JSON%": typeof JSON === "object" ? JSON : undefined2,
      "%Map%": typeof Map === "undefined" ? undefined2 : Map,
      "%MapIteratorPrototype%": typeof Map === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Map())[Symbol.iterator]()),
      "%Math%": Math,
      "%Number%": Number,
      "%Object%": $Object,
      "%Object.getOwnPropertyDescriptor%": $gOPD,
      "%parseFloat%": parseFloat,
      "%parseInt%": parseInt,
      "%Promise%": typeof Promise === "undefined" ? undefined2 : Promise,
      "%Proxy%": typeof Proxy === "undefined" ? undefined2 : Proxy,
      "%RangeError%": $RangeError,
      "%ReferenceError%": $ReferenceError,
      "%Reflect%": typeof Reflect === "undefined" ? undefined2 : Reflect,
      "%RegExp%": RegExp,
      "%Set%": typeof Set === "undefined" ? undefined2 : Set,
      "%SetIteratorPrototype%": typeof Set === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Set())[Symbol.iterator]()),
      "%SharedArrayBuffer%": typeof SharedArrayBuffer === "undefined" ? undefined2 : SharedArrayBuffer,
      "%String%": String,
      "%StringIteratorPrototype%": hasSymbols && getProto ? getProto(""[Symbol.iterator]()) : undefined2,
      "%Symbol%": hasSymbols ? Symbol : undefined2,
      "%SyntaxError%": $SyntaxError,
      "%ThrowTypeError%": ThrowTypeError,
      "%TypedArray%": TypedArray,
      "%TypeError%": $TypeError,
      "%Uint8Array%": typeof Uint8Array === "undefined" ? undefined2 : Uint8Array,
      "%Uint8ClampedArray%": typeof Uint8ClampedArray === "undefined" ? undefined2 : Uint8ClampedArray,
      "%Uint16Array%": typeof Uint16Array === "undefined" ? undefined2 : Uint16Array,
      "%Uint32Array%": typeof Uint32Array === "undefined" ? undefined2 : Uint32Array,
      "%URIError%": $URIError,
      "%WeakMap%": typeof WeakMap === "undefined" ? undefined2 : WeakMap,
      "%WeakRef%": typeof WeakRef === "undefined" ? undefined2 : WeakRef,
      "%WeakSet%": typeof WeakSet === "undefined" ? undefined2 : WeakSet,
      "%Function.prototype.call%": $call,
      "%Function.prototype.apply%": $apply,
      "%Object.defineProperty%": $defineProperty,
      "%Object.getPrototypeOf%": $ObjectGPO,
      "%Math.abs%": abs,
      "%Math.floor%": floor,
      "%Math.max%": max,
      "%Math.min%": min,
      "%Math.pow%": pow,
      "%Math.round%": round,
      "%Math.sign%": sign,
      "%Reflect.getPrototypeOf%": $ReflectGPO
    };
    if (getProto) {
      try {
        null.error;
      } catch (e) {
        errorProto = getProto(getProto(e));
        INTRINSICS["%Error.prototype%"] = errorProto;
      }
    }
    var errorProto;
    var doEval = function doEval2(name) {
      var value;
      if (name === "%AsyncFunction%") {
        value = getEvalledConstructor("async function () {}");
      } else if (name === "%GeneratorFunction%") {
        value = getEvalledConstructor("function* () {}");
      } else if (name === "%AsyncGeneratorFunction%") {
        value = getEvalledConstructor("async function* () {}");
      } else if (name === "%AsyncGenerator%") {
        var fn = doEval2("%AsyncGeneratorFunction%");
        if (fn) {
          value = fn.prototype;
        }
      } else if (name === "%AsyncIteratorPrototype%") {
        var gen = doEval2("%AsyncGenerator%");
        if (gen && getProto) {
          value = getProto(gen.prototype);
        }
      }
      INTRINSICS[name] = value;
      return value;
    };
    var LEGACY_ALIASES = {
      __proto__: null,
      "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
      "%ArrayPrototype%": ["Array", "prototype"],
      "%ArrayProto_entries%": ["Array", "prototype", "entries"],
      "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
      "%ArrayProto_keys%": ["Array", "prototype", "keys"],
      "%ArrayProto_values%": ["Array", "prototype", "values"],
      "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
      "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
      "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
      "%BooleanPrototype%": ["Boolean", "prototype"],
      "%DataViewPrototype%": ["DataView", "prototype"],
      "%DatePrototype%": ["Date", "prototype"],
      "%ErrorPrototype%": ["Error", "prototype"],
      "%EvalErrorPrototype%": ["EvalError", "prototype"],
      "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
      "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
      "%FunctionPrototype%": ["Function", "prototype"],
      "%Generator%": ["GeneratorFunction", "prototype"],
      "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
      "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
      "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
      "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
      "%JSONParse%": ["JSON", "parse"],
      "%JSONStringify%": ["JSON", "stringify"],
      "%MapPrototype%": ["Map", "prototype"],
      "%NumberPrototype%": ["Number", "prototype"],
      "%ObjectPrototype%": ["Object", "prototype"],
      "%ObjProto_toString%": ["Object", "prototype", "toString"],
      "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
      "%PromisePrototype%": ["Promise", "prototype"],
      "%PromiseProto_then%": ["Promise", "prototype", "then"],
      "%Promise_all%": ["Promise", "all"],
      "%Promise_reject%": ["Promise", "reject"],
      "%Promise_resolve%": ["Promise", "resolve"],
      "%RangeErrorPrototype%": ["RangeError", "prototype"],
      "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
      "%RegExpPrototype%": ["RegExp", "prototype"],
      "%SetPrototype%": ["Set", "prototype"],
      "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
      "%StringPrototype%": ["String", "prototype"],
      "%SymbolPrototype%": ["Symbol", "prototype"],
      "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
      "%TypedArrayPrototype%": ["TypedArray", "prototype"],
      "%TypeErrorPrototype%": ["TypeError", "prototype"],
      "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
      "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
      "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
      "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
      "%URIErrorPrototype%": ["URIError", "prototype"],
      "%WeakMapPrototype%": ["WeakMap", "prototype"],
      "%WeakSetPrototype%": ["WeakSet", "prototype"]
    };
    var bind2 = require_function_bind();
    var hasOwn = require_hasown();
    var $concat = bind2.call($call, Array.prototype.concat);
    var $spliceApply = bind2.call($apply, Array.prototype.splice);
    var $replace = bind2.call($call, String.prototype.replace);
    var $strSlice = bind2.call($call, String.prototype.slice);
    var $exec = bind2.call($call, RegExp.prototype.exec);
    var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
    var reEscapeChar = /\\(\\)?/g;
    var stringToPath = function stringToPath2(string) {
      var first = $strSlice(string, 0, 1);
      var last = $strSlice(string, -1);
      if (first === "%" && last !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected closing `%`");
      } else if (last === "%" && first !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected opening `%`");
      }
      var result = [];
      $replace(string, rePropName, function(match, number, quote, subString) {
        result[result.length] = quote ? $replace(subString, reEscapeChar, "$1") : number || match;
      });
      return result;
    };
    var getBaseIntrinsic = function getBaseIntrinsic2(name, allowMissing) {
      var intrinsicName = name;
      var alias;
      if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
        alias = LEGACY_ALIASES[intrinsicName];
        intrinsicName = "%" + alias[0] + "%";
      }
      if (hasOwn(INTRINSICS, intrinsicName)) {
        var value = INTRINSICS[intrinsicName];
        if (value === needsEval) {
          value = doEval(intrinsicName);
        }
        if (typeof value === "undefined" && !allowMissing) {
          throw new $TypeError("intrinsic " + name + " exists, but is not available. Please file an issue!");
        }
        return {
          alias,
          name: intrinsicName,
          value
        };
      }
      throw new $SyntaxError("intrinsic " + name + " does not exist!");
    };
    module2.exports = function GetIntrinsic(name, allowMissing) {
      if (typeof name !== "string" || name.length === 0) {
        throw new $TypeError("intrinsic name must be a non-empty string");
      }
      if (arguments.length > 1 && typeof allowMissing !== "boolean") {
        throw new $TypeError('"allowMissing" argument must be a boolean');
      }
      if ($exec(/^%?[^%]*%?$/, name) === null) {
        throw new $SyntaxError("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
      }
      var parts = stringToPath(name);
      var intrinsicBaseName = parts.length > 0 ? parts[0] : "";
      var intrinsic = getBaseIntrinsic("%" + intrinsicBaseName + "%", allowMissing);
      var intrinsicRealName = intrinsic.name;
      var value = intrinsic.value;
      var skipFurtherCaching = false;
      var alias = intrinsic.alias;
      if (alias) {
        intrinsicBaseName = alias[0];
        $spliceApply(parts, $concat([0, 1], alias));
      }
      for (var i = 1, isOwn = true; i < parts.length; i += 1) {
        var part = parts[i];
        var first = $strSlice(part, 0, 1);
        var last = $strSlice(part, -1);
        if ((first === '"' || first === "'" || first === "`" || (last === '"' || last === "'" || last === "`")) && first !== last) {
          throw new $SyntaxError("property names with quotes must have matching quotes");
        }
        if (part === "constructor" || !isOwn) {
          skipFurtherCaching = true;
        }
        intrinsicBaseName += "." + part;
        intrinsicRealName = "%" + intrinsicBaseName + "%";
        if (hasOwn(INTRINSICS, intrinsicRealName)) {
          value = INTRINSICS[intrinsicRealName];
        } else if (value != null) {
          if (!(part in value)) {
            if (!allowMissing) {
              throw new $TypeError("base intrinsic for " + name + " exists, but the property is not available.");
            }
            return void 0;
          }
          if ($gOPD && i + 1 >= parts.length) {
            var desc = $gOPD(value, part);
            isOwn = !!desc;
            if (isOwn && "get" in desc && !("originalValue" in desc.get)) {
              value = desc.get;
            } else {
              value = value[part];
            }
          } else {
            isOwn = hasOwn(value, part);
            value = value[part];
          }
          if (isOwn && !skipFurtherCaching) {
            INTRINSICS[intrinsicRealName] = value;
          }
        }
      }
      return value;
    };
  }
});

// node_modules/has-tostringtag/shams.js
var require_shams2 = __commonJS({
  "node_modules/has-tostringtag/shams.js"(exports2, module2) {
    "use strict";
    var hasSymbols = require_shams();
    module2.exports = function hasToStringTagShams() {
      return hasSymbols() && !!Symbol.toStringTag;
    };
  }
});

// node_modules/es-set-tostringtag/index.js
var require_es_set_tostringtag = __commonJS({
  "node_modules/es-set-tostringtag/index.js"(exports2, module2) {
    "use strict";
    var GetIntrinsic = require_get_intrinsic();
    var $defineProperty = GetIntrinsic("%Object.defineProperty%", true);
    var hasToStringTag = require_shams2()();
    var hasOwn = require_hasown();
    var $TypeError = require_type();
    var toStringTag2 = hasToStringTag ? Symbol.toStringTag : null;
    module2.exports = function setToStringTag(object, value) {
      var overrideIfSet = arguments.length > 2 && !!arguments[2] && arguments[2].force;
      var nonConfigurable = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
      if (typeof overrideIfSet !== "undefined" && typeof overrideIfSet !== "boolean" || typeof nonConfigurable !== "undefined" && typeof nonConfigurable !== "boolean") {
        throw new $TypeError("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
      }
      if (toStringTag2 && (overrideIfSet || !hasOwn(object, toStringTag2))) {
        if ($defineProperty) {
          $defineProperty(object, toStringTag2, {
            configurable: !nonConfigurable,
            enumerable: false,
            value,
            writable: false
          });
        } else {
          object[toStringTag2] = value;
        }
      }
    };
  }
});

// node_modules/form-data/lib/populate.js
var require_populate = __commonJS({
  "node_modules/form-data/lib/populate.js"(exports2, module2) {
    "use strict";
    module2.exports = function(dst, src) {
      Object.keys(src).forEach(function(prop) {
        dst[prop] = dst[prop] || src[prop];
      });
      return dst;
    };
  }
});

// node_modules/form-data/lib/form_data.js
var require_form_data = __commonJS({
  "node_modules/form-data/lib/form_data.js"(exports2, module2) {
    "use strict";
    var CombinedStream = require_combined_stream();
    var util3 = require("util");
    var path = require("path");
    var http3 = require("http");
    var https2 = require("https");
    var parseUrl = require("url").parse;
    var fs = require("fs");
    var Stream = require("stream").Stream;
    var crypto3 = require("crypto");
    var mime = require_mime_types();
    var asynckit = require_asynckit();
    var setToStringTag = require_es_set_tostringtag();
    var hasOwn = require_hasown();
    var populate = require_populate();
    function FormData3(options) {
      if (!(this instanceof FormData3)) {
        return new FormData3(options);
      }
      this._overheadLength = 0;
      this._valueLength = 0;
      this._valuesToMeasure = [];
      CombinedStream.call(this);
      options = options || {};
      for (var option in options) {
        this[option] = options[option];
      }
    }
    util3.inherits(FormData3, CombinedStream);
    FormData3.LINE_BREAK = "\r\n";
    FormData3.DEFAULT_CONTENT_TYPE = "application/octet-stream";
    FormData3.prototype.append = function(field, value, options) {
      options = options || {};
      if (typeof options === "string") {
        options = { filename: options };
      }
      var append2 = CombinedStream.prototype.append.bind(this);
      if (typeof value === "number" || value == null) {
        value = String(value);
      }
      if (Array.isArray(value)) {
        this._error(new Error("Arrays are not supported."));
        return;
      }
      var header = this._multiPartHeader(field, value, options);
      var footer = this._multiPartFooter();
      append2(header);
      append2(value);
      append2(footer);
      this._trackLength(header, value, options);
    };
    FormData3.prototype._trackLength = function(header, value, options) {
      var valueLength = 0;
      if (options.knownLength != null) {
        valueLength += Number(options.knownLength);
      } else if (Buffer.isBuffer(value)) {
        valueLength = value.length;
      } else if (typeof value === "string") {
        valueLength = Buffer.byteLength(value);
      }
      this._valueLength += valueLength;
      this._overheadLength += Buffer.byteLength(header) + FormData3.LINE_BREAK.length;
      if (!value || !value.path && !(value.readable && hasOwn(value, "httpVersion")) && !(value instanceof Stream)) {
        return;
      }
      if (!options.knownLength) {
        this._valuesToMeasure.push(value);
      }
    };
    FormData3.prototype._lengthRetriever = function(value, callback) {
      if (hasOwn(value, "fd")) {
        if (value.end != void 0 && value.end != Infinity && value.start != void 0) {
          callback(null, value.end + 1 - (value.start ? value.start : 0));
        } else {
          fs.stat(value.path, function(err, stat) {
            if (err) {
              callback(err);
              return;
            }
            var fileSize = stat.size - (value.start ? value.start : 0);
            callback(null, fileSize);
          });
        }
      } else if (hasOwn(value, "httpVersion")) {
        callback(null, Number(value.headers["content-length"]));
      } else if (hasOwn(value, "httpModule")) {
        value.on("response", function(response) {
          value.pause();
          callback(null, Number(response.headers["content-length"]));
        });
        value.resume();
      } else {
        callback("Unknown stream");
      }
    };
    FormData3.prototype._multiPartHeader = function(field, value, options) {
      if (typeof options.header === "string") {
        return options.header;
      }
      var contentDisposition = this._getContentDisposition(value, options);
      var contentType = this._getContentType(value, options);
      var contents = "";
      var headers = {
        // add custom disposition as third element or keep it two elements if not
        "Content-Disposition": ["form-data", 'name="' + field + '"'].concat(contentDisposition || []),
        // if no content type. allow it to be empty array
        "Content-Type": [].concat(contentType || [])
      };
      if (typeof options.header === "object") {
        populate(headers, options.header);
      }
      var header;
      for (var prop in headers) {
        if (hasOwn(headers, prop)) {
          header = headers[prop];
          if (header == null) {
            continue;
          }
          if (!Array.isArray(header)) {
            header = [header];
          }
          if (header.length) {
            contents += prop + ": " + header.join("; ") + FormData3.LINE_BREAK;
          }
        }
      }
      return "--" + this.getBoundary() + FormData3.LINE_BREAK + contents + FormData3.LINE_BREAK;
    };
    FormData3.prototype._getContentDisposition = function(value, options) {
      var filename;
      if (typeof options.filepath === "string") {
        filename = path.normalize(options.filepath).replace(/\\/g, "/");
      } else if (options.filename || value && (value.name || value.path)) {
        filename = path.basename(options.filename || value && (value.name || value.path));
      } else if (value && value.readable && hasOwn(value, "httpVersion")) {
        filename = path.basename(value.client._httpMessage.path || "");
      }
      if (filename) {
        return 'filename="' + filename + '"';
      }
    };
    FormData3.prototype._getContentType = function(value, options) {
      var contentType = options.contentType;
      if (!contentType && value && value.name) {
        contentType = mime.lookup(value.name);
      }
      if (!contentType && value && value.path) {
        contentType = mime.lookup(value.path);
      }
      if (!contentType && value && value.readable && hasOwn(value, "httpVersion")) {
        contentType = value.headers["content-type"];
      }
      if (!contentType && (options.filepath || options.filename)) {
        contentType = mime.lookup(options.filepath || options.filename);
      }
      if (!contentType && value && typeof value === "object") {
        contentType = FormData3.DEFAULT_CONTENT_TYPE;
      }
      return contentType;
    };
    FormData3.prototype._multiPartFooter = function() {
      return function(next) {
        var footer = FormData3.LINE_BREAK;
        var lastPart = this._streams.length === 0;
        if (lastPart) {
          footer += this._lastBoundary();
        }
        next(footer);
      }.bind(this);
    };
    FormData3.prototype._lastBoundary = function() {
      return "--" + this.getBoundary() + "--" + FormData3.LINE_BREAK;
    };
    FormData3.prototype.getHeaders = function(userHeaders) {
      var header;
      var formHeaders = {
        "content-type": "multipart/form-data; boundary=" + this.getBoundary()
      };
      for (header in userHeaders) {
        if (hasOwn(userHeaders, header)) {
          formHeaders[header.toLowerCase()] = userHeaders[header];
        }
      }
      return formHeaders;
    };
    FormData3.prototype.setBoundary = function(boundary) {
      if (typeof boundary !== "string") {
        throw new TypeError("FormData boundary must be a string");
      }
      this._boundary = boundary;
    };
    FormData3.prototype.getBoundary = function() {
      if (!this._boundary) {
        this._generateBoundary();
      }
      return this._boundary;
    };
    FormData3.prototype.getBuffer = function() {
      var dataBuffer = new Buffer.alloc(0);
      var boundary = this.getBoundary();
      for (var i = 0, len = this._streams.length; i < len; i++) {
        if (typeof this._streams[i] !== "function") {
          if (Buffer.isBuffer(this._streams[i])) {
            dataBuffer = Buffer.concat([dataBuffer, this._streams[i]]);
          } else {
            dataBuffer = Buffer.concat([dataBuffer, Buffer.from(this._streams[i])]);
          }
          if (typeof this._streams[i] !== "string" || this._streams[i].substring(2, boundary.length + 2) !== boundary) {
            dataBuffer = Buffer.concat([dataBuffer, Buffer.from(FormData3.LINE_BREAK)]);
          }
        }
      }
      return Buffer.concat([dataBuffer, Buffer.from(this._lastBoundary())]);
    };
    FormData3.prototype._generateBoundary = function() {
      this._boundary = "--------------------------" + crypto3.randomBytes(12).toString("hex");
    };
    FormData3.prototype.getLengthSync = function() {
      var knownLength = this._overheadLength + this._valueLength;
      if (this._streams.length) {
        knownLength += this._lastBoundary().length;
      }
      if (!this.hasKnownLength()) {
        this._error(new Error("Cannot calculate proper length in synchronous way."));
      }
      return knownLength;
    };
    FormData3.prototype.hasKnownLength = function() {
      var hasKnownLength = true;
      if (this._valuesToMeasure.length) {
        hasKnownLength = false;
      }
      return hasKnownLength;
    };
    FormData3.prototype.getLength = function(cb) {
      var knownLength = this._overheadLength + this._valueLength;
      if (this._streams.length) {
        knownLength += this._lastBoundary().length;
      }
      if (!this._valuesToMeasure.length) {
        process.nextTick(cb.bind(this, null, knownLength));
        return;
      }
      asynckit.parallel(this._valuesToMeasure, this._lengthRetriever, function(err, values) {
        if (err) {
          cb(err);
          return;
        }
        values.forEach(function(length) {
          knownLength += length;
        });
        cb(null, knownLength);
      });
    };
    FormData3.prototype.submit = function(params, cb) {
      var request;
      var options;
      var defaults2 = { method: "post" };
      if (typeof params === "string") {
        params = parseUrl(params);
        options = populate({
          port: params.port,
          path: params.pathname,
          host: params.hostname,
          protocol: params.protocol
        }, defaults2);
      } else {
        options = populate(params, defaults2);
        if (!options.port) {
          options.port = options.protocol === "https:" ? 443 : 80;
        }
      }
      options.headers = this.getHeaders(params.headers);
      if (options.protocol === "https:") {
        request = https2.request(options);
      } else {
        request = http3.request(options);
      }
      this.getLength(function(err, length) {
        if (err && err !== "Unknown stream") {
          this._error(err);
          return;
        }
        if (length) {
          request.setHeader("Content-Length", length);
        }
        this.pipe(request);
        if (cb) {
          var onResponse;
          var callback = function(error, responce) {
            request.removeListener("error", callback);
            request.removeListener("response", onResponse);
            return cb.call(this, error, responce);
          };
          onResponse = callback.bind(this, null);
          request.on("error", callback);
          request.on("response", onResponse);
        }
      }.bind(this));
      return request;
    };
    FormData3.prototype._error = function(err) {
      if (!this.error) {
        this.error = err;
        this.pause();
        this.emit("error", err);
      }
    };
    FormData3.prototype.toString = function() {
      return "[object FormData]";
    };
    setToStringTag(FormData3.prototype, "FormData");
    module2.exports = FormData3;
  }
});

// node_modules/proxy-from-env/index.js
var require_proxy_from_env = __commonJS({
  "node_modules/proxy-from-env/index.js"(exports2) {
    "use strict";
    var parseUrl = require("url").parse;
    var DEFAULT_PORTS = {
      ftp: 21,
      gopher: 70,
      http: 80,
      https: 443,
      ws: 80,
      wss: 443
    };
    var stringEndsWith = String.prototype.endsWith || function(s) {
      return s.length <= this.length && this.indexOf(s, this.length - s.length) !== -1;
    };
    function getProxyForUrl(url2) {
      var parsedUrl = typeof url2 === "string" ? parseUrl(url2) : url2 || {};
      var proto = parsedUrl.protocol;
      var hostname2 = parsedUrl.host;
      var port = parsedUrl.port;
      if (typeof hostname2 !== "string" || !hostname2 || typeof proto !== "string") {
        return "";
      }
      proto = proto.split(":", 1)[0];
      hostname2 = hostname2.replace(/:\d*$/, "");
      port = parseInt(port) || DEFAULT_PORTS[proto] || 0;
      if (!shouldProxy(hostname2, port)) {
        return "";
      }
      var proxy = getEnv("npm_config_" + proto + "_proxy") || getEnv(proto + "_proxy") || getEnv("npm_config_proxy") || getEnv("all_proxy");
      if (proxy && proxy.indexOf("://") === -1) {
        proxy = proto + "://" + proxy;
      }
      return proxy;
    }
    function shouldProxy(hostname2, port) {
      var NO_PROXY = (getEnv("npm_config_no_proxy") || getEnv("no_proxy")).toLowerCase();
      if (!NO_PROXY) {
        return true;
      }
      if (NO_PROXY === "*") {
        return false;
      }
      return NO_PROXY.split(/[,\s]/).every(function(proxy) {
        if (!proxy) {
          return true;
        }
        var parsedProxy = proxy.match(/^(.+):(\d+)$/);
        var parsedProxyHostname = parsedProxy ? parsedProxy[1] : proxy;
        var parsedProxyPort = parsedProxy ? parseInt(parsedProxy[2]) : 0;
        if (parsedProxyPort && parsedProxyPort !== port) {
          return true;
        }
        if (!/^[.*]/.test(parsedProxyHostname)) {
          return hostname2 !== parsedProxyHostname;
        }
        if (parsedProxyHostname.charAt(0) === "*") {
          parsedProxyHostname = parsedProxyHostname.slice(1);
        }
        return !stringEndsWith.call(hostname2, parsedProxyHostname);
      });
    }
    function getEnv(key) {
      return process.env[key.toLowerCase()] || process.env[key.toUpperCase()] || "";
    }
    exports2.getProxyForUrl = getProxyForUrl;
  }
});

// node_modules/follow-redirects/debug.js
var require_debug = __commonJS({
  "node_modules/follow-redirects/debug.js"(exports2, module2) {
    var debug;
    module2.exports = function() {
      if (!debug) {
        try {
          debug = require("debug")("follow-redirects");
        } catch (error) {
        }
        if (typeof debug !== "function") {
          debug = function() {
          };
        }
      }
      debug.apply(null, arguments);
    };
  }
});

// node_modules/follow-redirects/index.js
var require_follow_redirects = __commonJS({
  "node_modules/follow-redirects/index.js"(exports2, module2) {
    var url2 = require("url");
    var URL2 = url2.URL;
    var http3 = require("http");
    var https2 = require("https");
    var Writable = require("stream").Writable;
    var assert = require("assert");
    var debug = require_debug();
    (function detectUnsupportedEnvironment() {
      var looksLikeNode = typeof process !== "undefined";
      var looksLikeBrowser = typeof window !== "undefined" && typeof document !== "undefined";
      var looksLikeV8 = isFunction3(Error.captureStackTrace);
      if (!looksLikeNode && (looksLikeBrowser || !looksLikeV8)) {
        console.warn("The follow-redirects package should be excluded from browser builds.");
      }
    })();
    var useNativeURL = false;
    try {
      assert(new URL2(""));
    } catch (error) {
      useNativeURL = error.code === "ERR_INVALID_URL";
    }
    var preservedUrlFields = [
      "auth",
      "host",
      "hostname",
      "href",
      "path",
      "pathname",
      "port",
      "protocol",
      "query",
      "search",
      "hash"
    ];
    var events = ["abort", "aborted", "connect", "error", "socket", "timeout"];
    var eventHandlers = /* @__PURE__ */ Object.create(null);
    events.forEach(function(event) {
      eventHandlers[event] = function(arg1, arg2, arg3) {
        this._redirectable.emit(event, arg1, arg2, arg3);
      };
    });
    var InvalidUrlError = createErrorType(
      "ERR_INVALID_URL",
      "Invalid URL",
      TypeError
    );
    var RedirectionError = createErrorType(
      "ERR_FR_REDIRECTION_FAILURE",
      "Redirected request failed"
    );
    var TooManyRedirectsError = createErrorType(
      "ERR_FR_TOO_MANY_REDIRECTS",
      "Maximum number of redirects exceeded",
      RedirectionError
    );
    var MaxBodyLengthExceededError = createErrorType(
      "ERR_FR_MAX_BODY_LENGTH_EXCEEDED",
      "Request body larger than maxBodyLength limit"
    );
    var WriteAfterEndError = createErrorType(
      "ERR_STREAM_WRITE_AFTER_END",
      "write after end"
    );
    var destroy = Writable.prototype.destroy || noop2;
    function RedirectableRequest(options, responseCallback) {
      Writable.call(this);
      this._sanitizeOptions(options);
      this._options = options;
      this._ended = false;
      this._ending = false;
      this._redirectCount = 0;
      this._redirects = [];
      this._requestBodyLength = 0;
      this._requestBodyBuffers = [];
      if (responseCallback) {
        this.on("response", responseCallback);
      }
      var self2 = this;
      this._onNativeResponse = function(response) {
        try {
          self2._processResponse(response);
        } catch (cause) {
          self2.emit("error", cause instanceof RedirectionError ? cause : new RedirectionError({ cause }));
        }
      };
      this._performRequest();
    }
    RedirectableRequest.prototype = Object.create(Writable.prototype);
    RedirectableRequest.prototype.abort = function() {
      destroyRequest(this._currentRequest);
      this._currentRequest.abort();
      this.emit("abort");
    };
    RedirectableRequest.prototype.destroy = function(error) {
      destroyRequest(this._currentRequest, error);
      destroy.call(this, error);
      return this;
    };
    RedirectableRequest.prototype.write = function(data, encoding, callback) {
      if (this._ending) {
        throw new WriteAfterEndError();
      }
      if (!isString2(data) && !isBuffer2(data)) {
        throw new TypeError("data should be a string, Buffer or Uint8Array");
      }
      if (isFunction3(encoding)) {
        callback = encoding;
        encoding = null;
      }
      if (data.length === 0) {
        if (callback) {
          callback();
        }
        return;
      }
      if (this._requestBodyLength + data.length <= this._options.maxBodyLength) {
        this._requestBodyLength += data.length;
        this._requestBodyBuffers.push({ data, encoding });
        this._currentRequest.write(data, encoding, callback);
      } else {
        this.emit("error", new MaxBodyLengthExceededError());
        this.abort();
      }
    };
    RedirectableRequest.prototype.end = function(data, encoding, callback) {
      if (isFunction3(data)) {
        callback = data;
        data = encoding = null;
      } else if (isFunction3(encoding)) {
        callback = encoding;
        encoding = null;
      }
      if (!data) {
        this._ended = this._ending = true;
        this._currentRequest.end(null, null, callback);
      } else {
        var self2 = this;
        var currentRequest = this._currentRequest;
        this.write(data, encoding, function() {
          self2._ended = true;
          currentRequest.end(null, null, callback);
        });
        this._ending = true;
      }
    };
    RedirectableRequest.prototype.setHeader = function(name, value) {
      this._options.headers[name] = value;
      this._currentRequest.setHeader(name, value);
    };
    RedirectableRequest.prototype.removeHeader = function(name) {
      delete this._options.headers[name];
      this._currentRequest.removeHeader(name);
    };
    RedirectableRequest.prototype.setTimeout = function(msecs, callback) {
      var self2 = this;
      function destroyOnTimeout(socket) {
        socket.setTimeout(msecs);
        socket.removeListener("timeout", socket.destroy);
        socket.addListener("timeout", socket.destroy);
      }
      function startTimer(socket) {
        if (self2._timeout) {
          clearTimeout(self2._timeout);
        }
        self2._timeout = setTimeout(function() {
          self2.emit("timeout");
          clearTimer();
        }, msecs);
        destroyOnTimeout(socket);
      }
      function clearTimer() {
        if (self2._timeout) {
          clearTimeout(self2._timeout);
          self2._timeout = null;
        }
        self2.removeListener("abort", clearTimer);
        self2.removeListener("error", clearTimer);
        self2.removeListener("response", clearTimer);
        self2.removeListener("close", clearTimer);
        if (callback) {
          self2.removeListener("timeout", callback);
        }
        if (!self2.socket) {
          self2._currentRequest.removeListener("socket", startTimer);
        }
      }
      if (callback) {
        this.on("timeout", callback);
      }
      if (this.socket) {
        startTimer(this.socket);
      } else {
        this._currentRequest.once("socket", startTimer);
      }
      this.on("socket", destroyOnTimeout);
      this.on("abort", clearTimer);
      this.on("error", clearTimer);
      this.on("response", clearTimer);
      this.on("close", clearTimer);
      return this;
    };
    [
      "flushHeaders",
      "getHeader",
      "setNoDelay",
      "setSocketKeepAlive"
    ].forEach(function(method) {
      RedirectableRequest.prototype[method] = function(a, b) {
        return this._currentRequest[method](a, b);
      };
    });
    ["aborted", "connection", "socket"].forEach(function(property) {
      Object.defineProperty(RedirectableRequest.prototype, property, {
        get: function() {
          return this._currentRequest[property];
        }
      });
    });
    RedirectableRequest.prototype._sanitizeOptions = function(options) {
      if (!options.headers) {
        options.headers = {};
      }
      if (options.host) {
        if (!options.hostname) {
          options.hostname = options.host;
        }
        delete options.host;
      }
      if (!options.pathname && options.path) {
        var searchPos = options.path.indexOf("?");
        if (searchPos < 0) {
          options.pathname = options.path;
        } else {
          options.pathname = options.path.substring(0, searchPos);
          options.search = options.path.substring(searchPos);
        }
      }
    };
    RedirectableRequest.prototype._performRequest = function() {
      var protocol = this._options.protocol;
      var nativeProtocol = this._options.nativeProtocols[protocol];
      if (!nativeProtocol) {
        throw new TypeError("Unsupported protocol " + protocol);
      }
      if (this._options.agents) {
        var scheme = protocol.slice(0, -1);
        this._options.agent = this._options.agents[scheme];
      }
      var request = this._currentRequest = nativeProtocol.request(this._options, this._onNativeResponse);
      request._redirectable = this;
      for (var event of events) {
        request.on(event, eventHandlers[event]);
      }
      this._currentUrl = /^\//.test(this._options.path) ? url2.format(this._options) : (
        // When making a request to a proxy, […]
        // a client MUST send the target URI in absolute-form […].
        this._options.path
      );
      if (this._isRedirect) {
        var i = 0;
        var self2 = this;
        var buffers = this._requestBodyBuffers;
        (function writeNext(error) {
          if (request === self2._currentRequest) {
            if (error) {
              self2.emit("error", error);
            } else if (i < buffers.length) {
              var buffer = buffers[i++];
              if (!request.finished) {
                request.write(buffer.data, buffer.encoding, writeNext);
              }
            } else if (self2._ended) {
              request.end();
            }
          }
        })();
      }
    };
    RedirectableRequest.prototype._processResponse = function(response) {
      var statusCode = response.statusCode;
      if (this._options.trackRedirects) {
        this._redirects.push({
          url: this._currentUrl,
          headers: response.headers,
          statusCode
        });
      }
      var location = response.headers.location;
      if (!location || this._options.followRedirects === false || statusCode < 300 || statusCode >= 400) {
        response.responseUrl = this._currentUrl;
        response.redirects = this._redirects;
        this.emit("response", response);
        this._requestBodyBuffers = [];
        return;
      }
      destroyRequest(this._currentRequest);
      response.destroy();
      if (++this._redirectCount > this._options.maxRedirects) {
        throw new TooManyRedirectsError();
      }
      var requestHeaders;
      var beforeRedirect = this._options.beforeRedirect;
      if (beforeRedirect) {
        requestHeaders = Object.assign({
          // The Host header was set by nativeProtocol.request
          Host: response.req.getHeader("host")
        }, this._options.headers);
      }
      var method = this._options.method;
      if ((statusCode === 301 || statusCode === 302) && this._options.method === "POST" || // RFC7231§6.4.4: The 303 (See Other) status code indicates that
      // the server is redirecting the user agent to a different resource […]
      // A user agent can perform a retrieval request targeting that URI
      // (a GET or HEAD request if using HTTP) […]
      statusCode === 303 && !/^(?:GET|HEAD)$/.test(this._options.method)) {
        this._options.method = "GET";
        this._requestBodyBuffers = [];
        removeMatchingHeaders(/^content-/i, this._options.headers);
      }
      var currentHostHeader = removeMatchingHeaders(/^host$/i, this._options.headers);
      var currentUrlParts = parseUrl(this._currentUrl);
      var currentHost = currentHostHeader || currentUrlParts.host;
      var currentUrl = /^\w+:/.test(location) ? this._currentUrl : url2.format(Object.assign(currentUrlParts, { host: currentHost }));
      var redirectUrl = resolveUrl(location, currentUrl);
      debug("redirecting to", redirectUrl.href);
      this._isRedirect = true;
      spreadUrlObject(redirectUrl, this._options);
      if (redirectUrl.protocol !== currentUrlParts.protocol && redirectUrl.protocol !== "https:" || redirectUrl.host !== currentHost && !isSubdomain(redirectUrl.host, currentHost)) {
        removeMatchingHeaders(/^(?:(?:proxy-)?authorization|cookie)$/i, this._options.headers);
      }
      if (isFunction3(beforeRedirect)) {
        var responseDetails = {
          headers: response.headers,
          statusCode
        };
        var requestDetails = {
          url: currentUrl,
          method,
          headers: requestHeaders
        };
        beforeRedirect(this._options, responseDetails, requestDetails);
        this._sanitizeOptions(this._options);
      }
      this._performRequest();
    };
    function wrap(protocols) {
      var exports3 = {
        maxRedirects: 21,
        maxBodyLength: 10 * 1024 * 1024
      };
      var nativeProtocols = {};
      Object.keys(protocols).forEach(function(scheme) {
        var protocol = scheme + ":";
        var nativeProtocol = nativeProtocols[protocol] = protocols[scheme];
        var wrappedProtocol = exports3[scheme] = Object.create(nativeProtocol);
        function request(input, options, callback) {
          if (isURL(input)) {
            input = spreadUrlObject(input);
          } else if (isString2(input)) {
            input = spreadUrlObject(parseUrl(input));
          } else {
            callback = options;
            options = validateUrl(input);
            input = { protocol };
          }
          if (isFunction3(options)) {
            callback = options;
            options = null;
          }
          options = Object.assign({
            maxRedirects: exports3.maxRedirects,
            maxBodyLength: exports3.maxBodyLength
          }, input, options);
          options.nativeProtocols = nativeProtocols;
          if (!isString2(options.host) && !isString2(options.hostname)) {
            options.hostname = "::1";
          }
          assert.equal(options.protocol, protocol, "protocol mismatch");
          debug("options", options);
          return new RedirectableRequest(options, callback);
        }
        function get(input, options, callback) {
          var wrappedRequest = wrappedProtocol.request(input, options, callback);
          wrappedRequest.end();
          return wrappedRequest;
        }
        Object.defineProperties(wrappedProtocol, {
          request: { value: request, configurable: true, enumerable: true, writable: true },
          get: { value: get, configurable: true, enumerable: true, writable: true }
        });
      });
      return exports3;
    }
    function noop2() {
    }
    function parseUrl(input) {
      var parsed;
      if (useNativeURL) {
        parsed = new URL2(input);
      } else {
        parsed = validateUrl(url2.parse(input));
        if (!isString2(parsed.protocol)) {
          throw new InvalidUrlError({ input });
        }
      }
      return parsed;
    }
    function resolveUrl(relative, base) {
      return useNativeURL ? new URL2(relative, base) : parseUrl(url2.resolve(base, relative));
    }
    function validateUrl(input) {
      if (/^\[/.test(input.hostname) && !/^\[[:0-9a-f]+\]$/i.test(input.hostname)) {
        throw new InvalidUrlError({ input: input.href || input });
      }
      if (/^\[/.test(input.host) && !/^\[[:0-9a-f]+\](:\d+)?$/i.test(input.host)) {
        throw new InvalidUrlError({ input: input.href || input });
      }
      return input;
    }
    function spreadUrlObject(urlObject, target) {
      var spread3 = target || {};
      for (var key of preservedUrlFields) {
        spread3[key] = urlObject[key];
      }
      if (spread3.hostname.startsWith("[")) {
        spread3.hostname = spread3.hostname.slice(1, -1);
      }
      if (spread3.port !== "") {
        spread3.port = Number(spread3.port);
      }
      spread3.path = spread3.search ? spread3.pathname + spread3.search : spread3.pathname;
      return spread3;
    }
    function removeMatchingHeaders(regex, headers) {
      var lastValue;
      for (var header in headers) {
        if (regex.test(header)) {
          lastValue = headers[header];
          delete headers[header];
        }
      }
      return lastValue === null || typeof lastValue === "undefined" ? void 0 : String(lastValue).trim();
    }
    function createErrorType(code, message, baseClass) {
      function CustomError(properties) {
        if (isFunction3(Error.captureStackTrace)) {
          Error.captureStackTrace(this, this.constructor);
        }
        Object.assign(this, properties || {});
        this.code = code;
        this.message = this.cause ? message + ": " + this.cause.message : message;
      }
      CustomError.prototype = new (baseClass || Error)();
      Object.defineProperties(CustomError.prototype, {
        constructor: {
          value: CustomError,
          enumerable: false
        },
        name: {
          value: "Error [" + code + "]",
          enumerable: false
        }
      });
      return CustomError;
    }
    function destroyRequest(request, error) {
      for (var event of events) {
        request.removeListener(event, eventHandlers[event]);
      }
      request.on("error", noop2);
      request.destroy(error);
    }
    function isSubdomain(subdomain, domain) {
      assert(isString2(subdomain) && isString2(domain));
      var dot = subdomain.length - domain.length - 1;
      return dot > 0 && subdomain[dot] === "." && subdomain.endsWith(domain);
    }
    function isString2(value) {
      return typeof value === "string" || value instanceof String;
    }
    function isFunction3(value) {
      return typeof value === "function";
    }
    function isBuffer2(value) {
      return typeof value === "object" && "length" in value;
    }
    function isURL(value) {
      return URL2 && value instanceof URL2;
    }
    module2.exports = wrap({ http: http3, https: https2 });
    module2.exports.wrap = wrap;
  }
});

// node_modules/blueimp-md5/js/md5.js
var require_md5 = __commonJS({
  "node_modules/blueimp-md5/js/md5.js"(exports2, module2) {
    (function($) {
      "use strict";
      function safeAdd(x, y) {
        var lsw = (x & 65535) + (y & 65535);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return msw << 16 | lsw & 65535;
      }
      function bitRotateLeft(num, cnt) {
        return num << cnt | num >>> 32 - cnt;
      }
      function md5cmn(q, a, b, x, s, t) {
        return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
      }
      function md5ff(a, b, c, d, x, s, t) {
        return md5cmn(b & c | ~b & d, a, b, x, s, t);
      }
      function md5gg(a, b, c, d, x, s, t) {
        return md5cmn(b & d | c & ~d, a, b, x, s, t);
      }
      function md5hh(a, b, c, d, x, s, t) {
        return md5cmn(b ^ c ^ d, a, b, x, s, t);
      }
      function md5ii(a, b, c, d, x, s, t) {
        return md5cmn(c ^ (b | ~d), a, b, x, s, t);
      }
      function binlMD5(x, len) {
        x[len >> 5] |= 128 << len % 32;
        x[(len + 64 >>> 9 << 4) + 14] = len;
        var i;
        var olda;
        var oldb;
        var oldc;
        var oldd;
        var a = 1732584193;
        var b = -271733879;
        var c = -1732584194;
        var d = 271733878;
        for (i = 0; i < x.length; i += 16) {
          olda = a;
          oldb = b;
          oldc = c;
          oldd = d;
          a = md5ff(a, b, c, d, x[i], 7, -680876936);
          d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
          c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
          b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
          a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
          d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
          c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
          b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
          a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
          d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
          c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
          b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
          a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
          d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
          c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
          b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
          a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
          d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
          c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
          b = md5gg(b, c, d, a, x[i], 20, -373897302);
          a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
          d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
          c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
          b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
          a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
          d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
          c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
          b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
          a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
          d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
          c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
          b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
          a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
          d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
          c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
          b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
          a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
          d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
          c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
          b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
          a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
          d = md5hh(d, a, b, c, x[i], 11, -358537222);
          c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
          b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
          a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
          d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
          c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
          b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
          a = md5ii(a, b, c, d, x[i], 6, -198630844);
          d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
          c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
          b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
          a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
          d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
          c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
          b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
          a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
          d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
          c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
          b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
          a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
          d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
          c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
          b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
          a = safeAdd(a, olda);
          b = safeAdd(b, oldb);
          c = safeAdd(c, oldc);
          d = safeAdd(d, oldd);
        }
        return [a, b, c, d];
      }
      function binl2rstr(input) {
        var i;
        var output = "";
        var length32 = input.length * 32;
        for (i = 0; i < length32; i += 8) {
          output += String.fromCharCode(input[i >> 5] >>> i % 32 & 255);
        }
        return output;
      }
      function rstr2binl(input) {
        var i;
        var output = [];
        output[(input.length >> 2) - 1] = void 0;
        for (i = 0; i < output.length; i += 1) {
          output[i] = 0;
        }
        var length8 = input.length * 8;
        for (i = 0; i < length8; i += 8) {
          output[i >> 5] |= (input.charCodeAt(i / 8) & 255) << i % 32;
        }
        return output;
      }
      function rstrMD5(s) {
        return binl2rstr(binlMD5(rstr2binl(s), s.length * 8));
      }
      function rstrHMACMD5(key, data) {
        var i;
        var bkey = rstr2binl(key);
        var ipad = [];
        var opad = [];
        var hash;
        ipad[15] = opad[15] = void 0;
        if (bkey.length > 16) {
          bkey = binlMD5(bkey, key.length * 8);
        }
        for (i = 0; i < 16; i += 1) {
          ipad[i] = bkey[i] ^ 909522486;
          opad[i] = bkey[i] ^ 1549556828;
        }
        hash = binlMD5(ipad.concat(rstr2binl(data)), 512 + data.length * 8);
        return binl2rstr(binlMD5(opad.concat(hash), 512 + 128));
      }
      function rstr2hex(input) {
        var hexTab = "0123456789abcdef";
        var output = "";
        var x;
        var i;
        for (i = 0; i < input.length; i += 1) {
          x = input.charCodeAt(i);
          output += hexTab.charAt(x >>> 4 & 15) + hexTab.charAt(x & 15);
        }
        return output;
      }
      function str2rstrUTF8(input) {
        return unescape(encodeURIComponent(input));
      }
      function rawMD5(s) {
        return rstrMD5(str2rstrUTF8(s));
      }
      function hexMD5(s) {
        return rstr2hex(rawMD5(s));
      }
      function rawHMACMD5(k, d) {
        return rstrHMACMD5(str2rstrUTF8(k), str2rstrUTF8(d));
      }
      function hexHMACMD5(k, d) {
        return rstr2hex(rawHMACMD5(k, d));
      }
      function md52(string, key, raw) {
        if (!key) {
          if (!raw) {
            return hexMD5(string);
          }
          return rawMD5(string);
        }
        if (!raw) {
          return hexHMACMD5(key, string);
        }
        return rawHMACMD5(key, string);
      }
      if (typeof define === "function" && define.amd) {
        define(function() {
          return md52;
        });
      } else if (typeof module2 === "object" && module2.exports) {
        module2.exports = md52;
      } else {
        $.md5 = md52;
      }
    })(exports2);
  }
});

// node_modules/hash-wasm/dist/index.umd.js
var require_index_umd = __commonJS({
  "node_modules/hash-wasm/dist/index.umd.js"(exports2, module2) {
    (function(global2, factory2) {
      typeof exports2 === "object" && typeof module2 !== "undefined" ? factory2(exports2) : typeof define === "function" && define.amd ? define(["exports"], factory2) : (global2 = typeof globalThis !== "undefined" ? globalThis : global2 || self, factory2(global2.hashwasm = {}));
    })(exports2, function(exports3) {
      "use strict";
      var name$l = "adler32";
      var data$l = "AGFzbQEAAAABDANgAAF/YAAAYAF/AAMHBgABAgEAAgUEAQECAgYOAn8BQYCJBQt/AEGACAsHcAgGbWVtb3J5AgAOSGFzaF9HZXRCdWZmZXIAAAlIYXNoX0luaXQAAQtIYXNoX1VwZGF0ZQACCkhhc2hfRmluYWwAAw1IYXNoX0dldFN0YXRlAAQOSGFzaF9DYWxjdWxhdGUABQpTVEFURV9TSVpFAwEK6wkGBQBBgAkLCgBBAEEBNgKECAvjCAEHf0EAKAKECCIBQf//A3EhAiABQRB2IQMCQAJAIABBAUcNACACQQAtAIAJaiIBQY+AfGogASABQfD/A0sbIgEgA2oiBEEQdCIFQYCAPGogBSAEQfD/A0sbIAFyIQEMAQsCQAJAAkACQAJAIABBEEkNAEGACSEGIABBsCtJDQFBgAkhBgNAQQAhBQNAIAYgBWoiASgCACIEQf8BcSACaiICIANqIAIgBEEIdkH/AXFqIgJqIAIgBEEQdkH/AXFqIgJqIAIgBEEYdmoiAmogAiABQQRqKAIAIgRB/wFxaiICaiACIARBCHZB/wFxaiICaiACIARBEHZB/wFxaiICaiACIARBGHZqIgJqIAIgAUEIaigCACIEQf8BcWoiAmogAiAEQQh2Qf8BcWoiAmogAiAEQRB2Qf8BcWoiAmogAiAEQRh2aiIEaiAEIAFBDGooAgAiAUH/AXFqIgRqIAQgAUEIdkH/AXFqIgRqIAQgAUEQdkH/AXFqIgRqIAQgAUEYdmoiAmohAyAFQRBqIgVBsCtHDQALIANB8f8DcCEDIAJB8f8DcCECIAZBsCtqIQYgAEHQVGoiAEGvK0sNAAsgAEUNBCAAQQ9LDQEMAgsCQCAARQ0AAkACQCAAQQNxIgUNAEGACSEBIAAhBAwBCyAAQXxxIQRBACEBA0AgAiABQYAJai0AAGoiAiADaiEDIAUgAUEBaiIBRw0ACyAFQYAJaiEBCyAAQQRJDQADQCACIAEtAABqIgUgAS0AAWoiBiABLQACaiIAIAFBA2otAABqIgIgACAGIAUgA2pqamohAyABQQRqIQEgBEF8aiIEDQALCyACQY+AfGogAiACQfD/A0sbIANB8f8DcEEQdHIhAQwECwNAIAYoAgAiAUH/AXEgAmoiBCADaiAEIAFBCHZB/wFxaiIEaiAEIAFBEHZB/wFxaiIEaiAEIAFBGHZqIgRqIAQgBkEEaigCACIBQf8BcWoiBGogBCABQQh2Qf8BcWoiBGogBCABQRB2Qf8BcWoiBGogBCABQRh2aiIEaiAEIAZBCGooAgAiAUH/AXFqIgRqIAQgAUEIdkH/AXFqIgRqIAQgAUEQdkH/AXFqIgRqIAQgAUEYdmoiBGogBCAGQQxqKAIAIgFB/wFxaiIEaiAEIAFBCHZB/wFxaiIEaiAEIAFBEHZB/wFxaiIEaiAEIAFBGHZqIgJqIQMgBkEQaiEGIABBcGoiAEEPSw0ACyAARQ0BCyAAQX9qIQcCQCAAQQNxIgVFDQAgAEF8cSEAIAUhBCAGIQEDQCACIAEtAABqIgIgA2ohAyABQQFqIQEgBEF/aiIEDQALIAYgBWohBgsgB0EDSQ0AA0AgAiAGLQAAaiIBIAYtAAFqIgQgBi0AAmoiBSAGQQNqLQAAaiICIAUgBCABIANqampqIQMgBkEEaiEGIABBfGoiAA0ACwsgA0Hx/wNwIQMgAkHx/wNwIQILIAIgA0EQdHIhAQtBACABNgKECAsxAQF/QQBBACgChAgiAEEYdCAAQYD+A3FBCHRyIABBCHZBgP4DcSAAQRh2cnI2AoAJCwUAQYQICzsAQQBBATYChAggABACQQBBACgChAgiAEEYdCAAQYD+A3FBCHRyIABBCHZBgP4DcSAAQRh2cnI2AoAJCwsVAgBBgAgLBAQAAAAAQYQICwQBAAAA";
      var hash$l = "02ddbd17";
      var wasmJson$l = {
        name: name$l,
        data: data$l,
        hash: hash$l
      };
      function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) {
          return value instanceof P ? value : new P(function(resolve) {
            resolve(value);
          });
        }
        return new (P || (P = Promise))(function(resolve, reject) {
          function fulfilled(value) {
            try {
              step(generator.next(value));
            } catch (e) {
              reject(e);
            }
          }
          function rejected(value) {
            try {
              step(generator["throw"](value));
            } catch (e) {
              reject(e);
            }
          }
          function step(result) {
            result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
          }
          step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
      }
      typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
      };
      class Mutex {
        constructor() {
          this.mutex = Promise.resolve();
        }
        lock() {
          let begin = () => {
          };
          this.mutex = this.mutex.then(() => new Promise(begin));
          return new Promise((res) => {
            begin = res;
          });
        }
        dispatch(fn) {
          return __awaiter(this, void 0, void 0, function* () {
            const unlock = yield this.lock();
            try {
              return yield Promise.resolve(fn());
            } finally {
              unlock();
            }
          });
        }
      }
      var _a;
      function getGlobal2() {
        if (typeof globalThis !== "undefined")
          return globalThis;
        if (typeof self !== "undefined")
          return self;
        if (typeof window !== "undefined")
          return window;
        return global;
      }
      const globalObject = getGlobal2();
      const nodeBuffer = (_a = globalObject.Buffer) !== null && _a !== void 0 ? _a : null;
      const textEncoder2 = globalObject.TextEncoder ? new globalObject.TextEncoder() : null;
      function intArrayToString(arr, len) {
        return String.fromCharCode(...arr.subarray(0, len));
      }
      function hexCharCodesToInt(a, b) {
        return (a & 15) + (a >> 6 | a >> 3 & 8) << 4 | (b & 15) + (b >> 6 | b >> 3 & 8);
      }
      function writeHexToUInt8(buf, str) {
        const size = str.length >> 1;
        for (let i = 0; i < size; i++) {
          const index = i << 1;
          buf[i] = hexCharCodesToInt(str.charCodeAt(index), str.charCodeAt(index + 1));
        }
      }
      function hexStringEqualsUInt8(str, buf) {
        if (str.length !== buf.length * 2) {
          return false;
        }
        for (let i = 0; i < buf.length; i++) {
          const strIndex = i << 1;
          if (buf[i] !== hexCharCodesToInt(str.charCodeAt(strIndex), str.charCodeAt(strIndex + 1))) {
            return false;
          }
        }
        return true;
      }
      const alpha = "a".charCodeAt(0) - 10;
      const digit = "0".charCodeAt(0);
      function getDigestHex(tmpBuffer, input, hashLength) {
        let p = 0;
        for (let i = 0; i < hashLength; i++) {
          let nibble = input[i] >>> 4;
          tmpBuffer[p++] = nibble > 9 ? nibble + alpha : nibble + digit;
          nibble = input[i] & 15;
          tmpBuffer[p++] = nibble > 9 ? nibble + alpha : nibble + digit;
        }
        return String.fromCharCode.apply(null, tmpBuffer);
      }
      const getUInt8Buffer = nodeBuffer !== null ? (data2) => {
        if (typeof data2 === "string") {
          const buf = nodeBuffer.from(data2, "utf8");
          return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
        }
        if (nodeBuffer.isBuffer(data2)) {
          return new Uint8Array(data2.buffer, data2.byteOffset, data2.length);
        }
        if (ArrayBuffer.isView(data2)) {
          return new Uint8Array(data2.buffer, data2.byteOffset, data2.byteLength);
        }
        throw new Error("Invalid data type!");
      } : (data2) => {
        if (typeof data2 === "string") {
          return textEncoder2.encode(data2);
        }
        if (ArrayBuffer.isView(data2)) {
          return new Uint8Array(data2.buffer, data2.byteOffset, data2.byteLength);
        }
        throw new Error("Invalid data type!");
      };
      const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const base64Lookup = new Uint8Array(256);
      for (let i = 0; i < base64Chars.length; i++) {
        base64Lookup[base64Chars.charCodeAt(i)] = i;
      }
      function encodeBase64(data2, pad = true) {
        const len = data2.length;
        const extraBytes = len % 3;
        const parts = [];
        const len2 = len - extraBytes;
        for (let i = 0; i < len2; i += 3) {
          const tmp = (data2[i] << 16 & 16711680) + (data2[i + 1] << 8 & 65280) + (data2[i + 2] & 255);
          const triplet = base64Chars.charAt(tmp >> 18 & 63) + base64Chars.charAt(tmp >> 12 & 63) + base64Chars.charAt(tmp >> 6 & 63) + base64Chars.charAt(tmp & 63);
          parts.push(triplet);
        }
        if (extraBytes === 1) {
          const tmp = data2[len - 1];
          const a = base64Chars.charAt(tmp >> 2);
          const b = base64Chars.charAt(tmp << 4 & 63);
          parts.push(`${a}${b}`);
          if (pad) {
            parts.push("==");
          }
        } else if (extraBytes === 2) {
          const tmp = (data2[len - 2] << 8) + data2[len - 1];
          const a = base64Chars.charAt(tmp >> 10);
          const b = base64Chars.charAt(tmp >> 4 & 63);
          const c = base64Chars.charAt(tmp << 2 & 63);
          parts.push(`${a}${b}${c}`);
          if (pad) {
            parts.push("=");
          }
        }
        return parts.join("");
      }
      function getDecodeBase64Length(data2) {
        let bufferLength = Math.floor(data2.length * 0.75);
        const len = data2.length;
        if (data2[len - 1] === "=") {
          bufferLength -= 1;
          if (data2[len - 2] === "=") {
            bufferLength -= 1;
          }
        }
        return bufferLength;
      }
      function decodeBase64(data2) {
        const bufferLength = getDecodeBase64Length(data2);
        const len = data2.length;
        const bytes = new Uint8Array(bufferLength);
        let p = 0;
        for (let i = 0; i < len; i += 4) {
          const encoded1 = base64Lookup[data2.charCodeAt(i)];
          const encoded2 = base64Lookup[data2.charCodeAt(i + 1)];
          const encoded3 = base64Lookup[data2.charCodeAt(i + 2)];
          const encoded4 = base64Lookup[data2.charCodeAt(i + 3)];
          bytes[p] = encoded1 << 2 | encoded2 >> 4;
          p += 1;
          bytes[p] = (encoded2 & 15) << 4 | encoded3 >> 2;
          p += 1;
          bytes[p] = (encoded3 & 3) << 6 | encoded4 & 63;
          p += 1;
        }
        return bytes;
      }
      const MAX_HEAP = 16 * 1024;
      const WASM_FUNC_HASH_LENGTH = 4;
      const wasmMutex = new Mutex();
      const wasmModuleCache = /* @__PURE__ */ new Map();
      function WASMInterface(binary, hashLength) {
        return __awaiter(this, void 0, void 0, function* () {
          let wasmInstance = null;
          let memoryView = null;
          let initialized = false;
          if (typeof WebAssembly === "undefined") {
            throw new Error("WebAssembly is not supported in this environment!");
          }
          const writeMemory = (data2, offset = 0) => {
            memoryView.set(data2, offset);
          };
          const getMemory = () => memoryView;
          const getExports = () => wasmInstance.exports;
          const setMemorySize = (totalSize) => {
            wasmInstance.exports.Hash_SetMemorySize(totalSize);
            const arrayOffset = wasmInstance.exports.Hash_GetBuffer();
            const memoryBuffer = wasmInstance.exports.memory.buffer;
            memoryView = new Uint8Array(memoryBuffer, arrayOffset, totalSize);
          };
          const getStateSize = () => {
            const view = new DataView(wasmInstance.exports.memory.buffer);
            const stateSize = view.getUint32(wasmInstance.exports.STATE_SIZE, true);
            return stateSize;
          };
          const loadWASMPromise = wasmMutex.dispatch(() => __awaiter(this, void 0, void 0, function* () {
            if (!wasmModuleCache.has(binary.name)) {
              const asm = decodeBase64(binary.data);
              const promise = WebAssembly.compile(asm);
              wasmModuleCache.set(binary.name, promise);
            }
            const module3 = yield wasmModuleCache.get(binary.name);
            wasmInstance = yield WebAssembly.instantiate(module3, {
              // env: {
              //   emscripten_memcpy_big: (dest, src, num) => {
              //     const memoryBuffer = wasmInstance.exports.memory.buffer;
              //     const memView = new Uint8Array(memoryBuffer, 0);
              //     memView.set(memView.subarray(src, src + num), dest);
              //   },
              //   print_memory: (offset, len) => {
              //     const memoryBuffer = wasmInstance.exports.memory.buffer;
              //     const memView = new Uint8Array(memoryBuffer, 0);
              //     console.log('print_int32', memView.subarray(offset, offset + len));
              //   },
              // },
            });
          }));
          const setupInterface = () => __awaiter(this, void 0, void 0, function* () {
            if (!wasmInstance) {
              yield loadWASMPromise;
            }
            const arrayOffset = wasmInstance.exports.Hash_GetBuffer();
            const memoryBuffer = wasmInstance.exports.memory.buffer;
            memoryView = new Uint8Array(memoryBuffer, arrayOffset, MAX_HEAP);
          });
          const init = (bits = null) => {
            initialized = true;
            wasmInstance.exports.Hash_Init(bits);
          };
          const updateUInt8Array = (data2) => {
            let read = 0;
            while (read < data2.length) {
              const chunk = data2.subarray(read, read + MAX_HEAP);
              read += chunk.length;
              memoryView.set(chunk);
              wasmInstance.exports.Hash_Update(chunk.length);
            }
          };
          const update = (data2) => {
            if (!initialized) {
              throw new Error("update() called before init()");
            }
            const Uint8Buffer = getUInt8Buffer(data2);
            updateUInt8Array(Uint8Buffer);
          };
          const digestChars = new Uint8Array(hashLength * 2);
          const digest = (outputType, padding = null) => {
            if (!initialized) {
              throw new Error("digest() called before init()");
            }
            initialized = false;
            wasmInstance.exports.Hash_Final(padding);
            if (outputType === "binary") {
              return memoryView.slice(0, hashLength);
            }
            return getDigestHex(digestChars, memoryView, hashLength);
          };
          const save = () => {
            if (!initialized) {
              throw new Error("save() can only be called after init() and before digest()");
            }
            const stateOffset = wasmInstance.exports.Hash_GetState();
            const stateLength = getStateSize();
            const memoryBuffer = wasmInstance.exports.memory.buffer;
            const internalState = new Uint8Array(memoryBuffer, stateOffset, stateLength);
            const prefixedState = new Uint8Array(WASM_FUNC_HASH_LENGTH + stateLength);
            writeHexToUInt8(prefixedState, binary.hash);
            prefixedState.set(internalState, WASM_FUNC_HASH_LENGTH);
            return prefixedState;
          };
          const load = (state) => {
            if (!(state instanceof Uint8Array)) {
              throw new Error("load() expects an Uint8Array generated by save()");
            }
            const stateOffset = wasmInstance.exports.Hash_GetState();
            const stateLength = getStateSize();
            const overallLength = WASM_FUNC_HASH_LENGTH + stateLength;
            const memoryBuffer = wasmInstance.exports.memory.buffer;
            if (state.length !== overallLength) {
              throw new Error(`Bad state length (expected ${overallLength} bytes, got ${state.length})`);
            }
            if (!hexStringEqualsUInt8(binary.hash, state.subarray(0, WASM_FUNC_HASH_LENGTH))) {
              throw new Error("This state was written by an incompatible hash implementation");
            }
            const internalState = state.subarray(WASM_FUNC_HASH_LENGTH);
            new Uint8Array(memoryBuffer, stateOffset, stateLength).set(internalState);
            initialized = true;
          };
          const isDataShort = (data2) => {
            if (typeof data2 === "string") {
              return data2.length < MAX_HEAP / 4;
            }
            return data2.byteLength < MAX_HEAP;
          };
          let canSimplify = isDataShort;
          switch (binary.name) {
            case "argon2":
            case "scrypt":
              canSimplify = () => true;
              break;
            case "blake2b":
            case "blake2s":
              canSimplify = (data2, initParam) => initParam <= 512 && isDataShort(data2);
              break;
            case "blake3":
              canSimplify = (data2, initParam) => initParam === 0 && isDataShort(data2);
              break;
            case "xxhash64":
            // cannot simplify
            case "xxhash3":
            case "xxhash128":
            case "crc64":
              canSimplify = () => false;
              break;
          }
          const calculate = (data2, initParam = null, digestParam = null) => {
            if (!canSimplify(data2, initParam)) {
              init(initParam);
              update(data2);
              return digest("hex", digestParam);
            }
            const buffer = getUInt8Buffer(data2);
            memoryView.set(buffer);
            wasmInstance.exports.Hash_Calculate(buffer.length, initParam, digestParam);
            return getDigestHex(digestChars, memoryView, hashLength);
          };
          yield setupInterface();
          return {
            getMemory,
            writeMemory,
            getExports,
            setMemorySize,
            init,
            update,
            digest,
            save,
            load,
            calculate,
            hashLength
          };
        });
      }
      function lockedCreate(mutex2, binary, hashLength) {
        return __awaiter(this, void 0, void 0, function* () {
          const unlock = yield mutex2.lock();
          const wasm = yield WASMInterface(binary, hashLength);
          unlock();
          return wasm;
        });
      }
      const mutex$l = new Mutex();
      let wasmCache$l = null;
      function adler32(data2) {
        if (wasmCache$l === null) {
          return lockedCreate(mutex$l, wasmJson$l, 4).then((wasm) => {
            wasmCache$l = wasm;
            return wasmCache$l.calculate(data2);
          });
        }
        try {
          const hash2 = wasmCache$l.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createAdler32() {
        return WASMInterface(wasmJson$l, 4).then((wasm) => {
          wasm.init();
          const obj = {
            init: () => {
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 4,
            digestSize: 4
          };
          return obj;
        });
      }
      var name$k = "argon2";
      var data$k = "AGFzbQEAAAABKQVgAX8Bf2AAAX9gEH9/f39/f39/f39/f39/f38AYAR/f39/AGACf38AAwYFAAECAwQFBgEBAoCAAgYIAX8BQZCoBAsHQQQGbWVtb3J5AgASSGFzaF9TZXRNZW1vcnlTaXplAAAOSGFzaF9HZXRCdWZmZXIAAQ5IYXNoX0NhbGN1bGF0ZQAECvEyBVgBAn9BACEBAkAgAEEAKAKICCICRg0AAkAgACACayIAQRB2IABBgIB8cSAASWoiAEAAQX9HDQBB/wHADwtBACEBQQBBACkDiAggAEEQdK18NwOICAsgAcALcAECfwJAQQAoAoAIIgANAEEAPwBBEHQiADYCgAhBACgCiAgiAUGAgCBGDQACQEGAgCAgAWsiAEEQdiAAQYCAfHEgAElqIgBAAEF/Rw0AQQAPC0EAQQApA4gIIABBEHStfDcDiAhBACgCgAghAAsgAAvcDgECfiAAIAQpAwAiECAAKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACAMIBAgDCkDAIVCIIkiEDcDACAIIBAgCCkDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgBCAQIAQpAwCFQiiJIhA3AwAgACAQIAApAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIAwgECAMKQMAhUIwiSIQNwMAIAggECAIKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAEIBAgBCkDAIVCAYk3AwAgASAFKQMAIhAgASkDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgDSAQIA0pAwCFQiCJIhA3AwAgCSAQIAkpAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIAUgECAFKQMAhUIoiSIQNwMAIAEgECABKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACANIBAgDSkDAIVCMIkiEDcDACAJIBAgCSkDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgBSAQIAUpAwCFQgGJNwMAIAIgBikDACIQIAIpAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIA4gECAOKQMAhUIgiSIQNwMAIAogECAKKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACAGIBAgBikDAIVCKIkiEDcDACACIBAgAikDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgDiAQIA4pAwCFQjCJIhA3AwAgCiAQIAopAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIAYgECAGKQMAhUIBiTcDACADIAcpAwAiECADKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACAPIBAgDykDAIVCIIkiEDcDACALIBAgCykDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgByAQIAcpAwCFQiiJIhA3AwAgAyAQIAMpAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIA8gECAPKQMAhUIwiSIQNwMAIAsgECALKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAHIBAgBykDAIVCAYk3AwAgACAFKQMAIhAgACkDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgDyAQIA8pAwCFQiCJIhA3AwAgCiAQIAopAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIAUgECAFKQMAhUIoiSIQNwMAIAAgECAAKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAPIBAgDykDAIVCMIkiEDcDACAKIBAgCikDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgBSAQIAUpAwCFQgGJNwMAIAEgBikDACIQIAEpAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIAwgECAMKQMAhUIgiSIQNwMAIAsgECALKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACAGIBAgBikDAIVCKIkiEDcDACABIBAgASkDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgDCAQIAwpAwCFQjCJIhA3AwAgCyAQIAspAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIAYgECAGKQMAhUIBiTcDACACIAcpAwAiECACKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACANIBAgDSkDAIVCIIkiEDcDACAIIBAgCCkDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgByAQIAcpAwCFQiiJIhA3AwAgAiAQIAIpAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIA0gECANKQMAhUIwiSIQNwMAIAggECAIKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAHIBAgBykDAIVCAYk3AwAgAyAEKQMAIhAgAykDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgDiAQIA4pAwCFQiCJIhA3AwAgCSAQIAkpAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIAQgECAEKQMAhUIoiSIQNwMAIAMgECADKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAOIBAgDikDAIVCMIkiEDcDACAJIBAgCSkDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgBCAQIAQpAwCFQgGJNwMAC98aAQN/QQAhBEEAIAIpAwAgASkDAIU3A5AIQQAgAikDCCABKQMIhTcDmAhBACACKQMQIAEpAxCFNwOgCEEAIAIpAxggASkDGIU3A6gIQQAgAikDICABKQMghTcDsAhBACACKQMoIAEpAyiFNwO4CEEAIAIpAzAgASkDMIU3A8AIQQAgAikDOCABKQM4hTcDyAhBACACKQNAIAEpA0CFNwPQCEEAIAIpA0ggASkDSIU3A9gIQQAgAikDUCABKQNQhTcD4AhBACACKQNYIAEpA1iFNwPoCEEAIAIpA2AgASkDYIU3A/AIQQAgAikDaCABKQNohTcD+AhBACACKQNwIAEpA3CFNwOACUEAIAIpA3ggASkDeIU3A4gJQQAgAikDgAEgASkDgAGFNwOQCUEAIAIpA4gBIAEpA4gBhTcDmAlBACACKQOQASABKQOQAYU3A6AJQQAgAikDmAEgASkDmAGFNwOoCUEAIAIpA6ABIAEpA6ABhTcDsAlBACACKQOoASABKQOoAYU3A7gJQQAgAikDsAEgASkDsAGFNwPACUEAIAIpA7gBIAEpA7gBhTcDyAlBACACKQPAASABKQPAAYU3A9AJQQAgAikDyAEgASkD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";
      var hash$k = "e4cdc523";
      var wasmJson$k = {
        name: name$k,
        data: data$k,
        hash: hash$k
      };
      var name$j = "blake2b";
      var data$j = "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";
      var hash$j = "c6f286e6";
      var wasmJson$j = {
        name: name$j,
        data: data$j,
        hash: hash$j
      };
      const mutex$k = new Mutex();
      let wasmCache$k = null;
      function validateBits$4(bits) {
        if (!Number.isInteger(bits) || bits < 8 || bits > 512 || bits % 8 !== 0) {
          return new Error("Invalid variant! Valid values: 8, 16, ..., 512");
        }
        return null;
      }
      function getInitParam$1(outputBits, keyBits) {
        return outputBits | keyBits << 16;
      }
      function blake2b(data2, bits = 512, key = null) {
        if (validateBits$4(bits)) {
          return Promise.reject(validateBits$4(bits));
        }
        let keyBuffer = null;
        let initParam = bits;
        if (key !== null) {
          keyBuffer = getUInt8Buffer(key);
          if (keyBuffer.length > 64) {
            return Promise.reject(new Error("Max key length is 64 bytes"));
          }
          initParam = getInitParam$1(bits, keyBuffer.length);
        }
        const hashLength = bits / 8;
        if (wasmCache$k === null || wasmCache$k.hashLength !== hashLength) {
          return lockedCreate(mutex$k, wasmJson$j, hashLength).then((wasm) => {
            wasmCache$k = wasm;
            if (initParam > 512) {
              wasmCache$k.writeMemory(keyBuffer);
            }
            return wasmCache$k.calculate(data2, initParam);
          });
        }
        try {
          if (initParam > 512) {
            wasmCache$k.writeMemory(keyBuffer);
          }
          const hash2 = wasmCache$k.calculate(data2, initParam);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createBLAKE2b(bits = 512, key = null) {
        if (validateBits$4(bits)) {
          return Promise.reject(validateBits$4(bits));
        }
        let keyBuffer = null;
        let initParam = bits;
        if (key !== null) {
          keyBuffer = getUInt8Buffer(key);
          if (keyBuffer.length > 64) {
            return Promise.reject(new Error("Max key length is 64 bytes"));
          }
          initParam = getInitParam$1(bits, keyBuffer.length);
        }
        const outputSize = bits / 8;
        return WASMInterface(wasmJson$j, outputSize).then((wasm) => {
          if (initParam > 512) {
            wasm.writeMemory(keyBuffer);
          }
          wasm.init(initParam);
          const obj = {
            init: initParam > 512 ? () => {
              wasm.writeMemory(keyBuffer);
              wasm.init(initParam);
              return obj;
            } : () => {
              wasm.init(initParam);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 128,
            digestSize: outputSize
          };
          return obj;
        });
      }
      function encodeResult(salt, options, res) {
        const parameters = [
          `m=${options.memorySize}`,
          `t=${options.iterations}`,
          `p=${options.parallelism}`
        ].join(",");
        return `$argon2${options.hashType}$v=19$${parameters}$${encodeBase64(salt, false)}$${encodeBase64(res, false)}`;
      }
      const uint32View = new DataView(new ArrayBuffer(4));
      function int32LE(x) {
        uint32View.setInt32(0, x, true);
        return new Uint8Array(uint32View.buffer);
      }
      function hashFunc(blake512, buf, len) {
        return __awaiter(this, void 0, void 0, function* () {
          if (len <= 64) {
            const blake = yield createBLAKE2b(len * 8);
            blake.update(int32LE(len));
            blake.update(buf);
            return blake.digest("binary");
          }
          const r = Math.ceil(len / 32) - 2;
          const ret = new Uint8Array(len);
          blake512.init();
          blake512.update(int32LE(len));
          blake512.update(buf);
          let vp = blake512.digest("binary");
          ret.set(vp.subarray(0, 32), 0);
          for (let i = 1; i < r; i++) {
            blake512.init();
            blake512.update(vp);
            vp = blake512.digest("binary");
            ret.set(vp.subarray(0, 32), i * 32);
          }
          const partialBytesNeeded = len - 32 * r;
          let blakeSmall;
          if (partialBytesNeeded === 64) {
            blakeSmall = blake512;
            blakeSmall.init();
          } else {
            blakeSmall = yield createBLAKE2b(partialBytesNeeded * 8);
          }
          blakeSmall.update(vp);
          vp = blakeSmall.digest("binary");
          ret.set(vp.subarray(0, partialBytesNeeded), r * 32);
          return ret;
        });
      }
      function getHashType(type) {
        switch (type) {
          case "d":
            return 0;
          case "i":
            return 1;
          default:
            return 2;
        }
      }
      function argon2Internal(options) {
        return __awaiter(this, void 0, void 0, function* () {
          var _a2;
          const { parallelism, iterations, hashLength } = options;
          const password = getUInt8Buffer(options.password);
          const salt = getUInt8Buffer(options.salt);
          const version = 19;
          const hashType = getHashType(options.hashType);
          const { memorySize } = options;
          const secret = getUInt8Buffer((_a2 = options.secret) !== null && _a2 !== void 0 ? _a2 : "");
          const [argon2Interface, blake512] = yield Promise.all([
            WASMInterface(wasmJson$k, 1024),
            createBLAKE2b(512)
          ]);
          argon2Interface.setMemorySize(memorySize * 1024 + 1024);
          const initVector = new Uint8Array(24);
          const initVectorView = new DataView(initVector.buffer);
          initVectorView.setInt32(0, parallelism, true);
          initVectorView.setInt32(4, hashLength, true);
          initVectorView.setInt32(8, memorySize, true);
          initVectorView.setInt32(12, iterations, true);
          initVectorView.setInt32(16, version, true);
          initVectorView.setInt32(20, hashType, true);
          argon2Interface.writeMemory(initVector, memorySize * 1024);
          blake512.init();
          blake512.update(initVector);
          blake512.update(int32LE(password.length));
          blake512.update(password);
          blake512.update(int32LE(salt.length));
          blake512.update(salt);
          blake512.update(int32LE(secret.length));
          blake512.update(secret);
          blake512.update(int32LE(0));
          const segments = Math.floor(memorySize / (parallelism * 4));
          const lanes = segments * 4;
          const param = new Uint8Array(72);
          const H0 = blake512.digest("binary");
          param.set(H0);
          for (let lane = 0; lane < parallelism; lane++) {
            param.set(int32LE(0), 64);
            param.set(int32LE(lane), 68);
            let position = lane * lanes;
            let chunk = yield hashFunc(blake512, param, 1024);
            argon2Interface.writeMemory(chunk, position * 1024);
            position += 1;
            param.set(int32LE(1), 64);
            chunk = yield hashFunc(blake512, param, 1024);
            argon2Interface.writeMemory(chunk, position * 1024);
          }
          const C = new Uint8Array(1024);
          writeHexToUInt8(C, argon2Interface.calculate(new Uint8Array([]), memorySize));
          const res = yield hashFunc(blake512, C, hashLength);
          if (options.outputType === "hex") {
            const digestChars = new Uint8Array(hashLength * 2);
            return getDigestHex(digestChars, res, hashLength);
          }
          if (options.outputType === "encoded") {
            return encodeResult(salt, options, res);
          }
          return res;
        });
      }
      const validateOptions$3 = (options) => {
        var _a2;
        if (!options || typeof options !== "object") {
          throw new Error("Invalid options parameter. It requires an object.");
        }
        if (!options.password) {
          throw new Error("Password must be specified");
        }
        options.password = getUInt8Buffer(options.password);
        if (options.password.length < 1) {
          throw new Error("Password must be specified");
        }
        if (!options.salt) {
          throw new Error("Salt must be specified");
        }
        options.salt = getUInt8Buffer(options.salt);
        if (options.salt.length < 8) {
          throw new Error("Salt should be at least 8 bytes long");
        }
        options.secret = getUInt8Buffer((_a2 = options.secret) !== null && _a2 !== void 0 ? _a2 : "");
        if (!Number.isInteger(options.iterations) || options.iterations < 1) {
          throw new Error("Iterations should be a positive number");
        }
        if (!Number.isInteger(options.parallelism) || options.parallelism < 1) {
          throw new Error("Parallelism should be a positive number");
        }
        if (!Number.isInteger(options.hashLength) || options.hashLength < 4) {
          throw new Error("Hash length should be at least 4 bytes.");
        }
        if (!Number.isInteger(options.memorySize)) {
          throw new Error("Memory size should be specified.");
        }
        if (options.memorySize < 8 * options.parallelism) {
          throw new Error("Memory size should be at least 8 * parallelism.");
        }
        if (options.outputType === void 0) {
          options.outputType = "hex";
        }
        if (!["hex", "binary", "encoded"].includes(options.outputType)) {
          throw new Error(`Insupported output type ${options.outputType}. Valid values: ['hex', 'binary', 'encoded']`);
        }
      };
      function argon2i(options) {
        return __awaiter(this, void 0, void 0, function* () {
          validateOptions$3(options);
          return argon2Internal(Object.assign(Object.assign({}, options), { hashType: "i" }));
        });
      }
      function argon2id2(options) {
        return __awaiter(this, void 0, void 0, function* () {
          validateOptions$3(options);
          return argon2Internal(Object.assign(Object.assign({}, options), { hashType: "id" }));
        });
      }
      function argon2d(options) {
        return __awaiter(this, void 0, void 0, function* () {
          validateOptions$3(options);
          return argon2Internal(Object.assign(Object.assign({}, options), { hashType: "d" }));
        });
      }
      const getHashParameters = (password, encoded, secret) => {
        const regex = /^\$argon2(id|i|d)\$v=([0-9]+)\$((?:[mtp]=[0-9]+,){2}[mtp]=[0-9]+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;
        const match = encoded.match(regex);
        if (!match) {
          throw new Error("Invalid hash");
        }
        const [, hashType, version, parameters, salt, hash2] = match;
        if (version !== "19") {
          throw new Error(`Unsupported version: ${version}`);
        }
        const parsedParameters = {};
        const paramMap = { m: "memorySize", p: "parallelism", t: "iterations" };
        for (const x of parameters.split(",")) {
          const [n, v] = x.split("=");
          parsedParameters[paramMap[n]] = Number(v);
        }
        return Object.assign(Object.assign({}, parsedParameters), {
          password,
          secret,
          hashType,
          salt: decodeBase64(salt),
          hashLength: getDecodeBase64Length(hash2),
          outputType: "encoded"
        });
      };
      const validateVerifyOptions$1 = (options) => {
        if (!options || typeof options !== "object") {
          throw new Error("Invalid options parameter. It requires an object.");
        }
        if (options.hash === void 0 || typeof options.hash !== "string") {
          throw new Error("Hash should be specified");
        }
      };
      function argon2Verify(options) {
        return __awaiter(this, void 0, void 0, function* () {
          validateVerifyOptions$1(options);
          const params = getHashParameters(options.password, options.hash, options.secret);
          validateOptions$3(params);
          const hashStart = options.hash.lastIndexOf("$") + 1;
          const result = yield argon2Internal(params);
          return result.substring(hashStart) === options.hash.substring(hashStart);
        });
      }
      var name$i = "blake2s";
      var data$i = "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";
      var hash$i = "5c0ff166";
      var wasmJson$i = {
        name: name$i,
        data: data$i,
        hash: hash$i
      };
      const mutex$j = new Mutex();
      let wasmCache$j = null;
      function validateBits$3(bits) {
        if (!Number.isInteger(bits) || bits < 8 || bits > 256 || bits % 8 !== 0) {
          return new Error("Invalid variant! Valid values: 8, 16, ..., 256");
        }
        return null;
      }
      function getInitParam(outputBits, keyBits) {
        return outputBits | keyBits << 16;
      }
      function blake2s(data2, bits = 256, key = null) {
        if (validateBits$3(bits)) {
          return Promise.reject(validateBits$3(bits));
        }
        let keyBuffer = null;
        let initParam = bits;
        if (key !== null) {
          keyBuffer = getUInt8Buffer(key);
          if (keyBuffer.length > 32) {
            return Promise.reject(new Error("Max key length is 32 bytes"));
          }
          initParam = getInitParam(bits, keyBuffer.length);
        }
        const hashLength = bits / 8;
        if (wasmCache$j === null || wasmCache$j.hashLength !== hashLength) {
          return lockedCreate(mutex$j, wasmJson$i, hashLength).then((wasm) => {
            wasmCache$j = wasm;
            if (initParam > 512) {
              wasmCache$j.writeMemory(keyBuffer);
            }
            return wasmCache$j.calculate(data2, initParam);
          });
        }
        try {
          if (initParam > 512) {
            wasmCache$j.writeMemory(keyBuffer);
          }
          const hash2 = wasmCache$j.calculate(data2, initParam);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createBLAKE2s(bits = 256, key = null) {
        if (validateBits$3(bits)) {
          return Promise.reject(validateBits$3(bits));
        }
        let keyBuffer = null;
        let initParam = bits;
        if (key !== null) {
          keyBuffer = getUInt8Buffer(key);
          if (keyBuffer.length > 32) {
            return Promise.reject(new Error("Max key length is 32 bytes"));
          }
          initParam = getInitParam(bits, keyBuffer.length);
        }
        const outputSize = bits / 8;
        return WASMInterface(wasmJson$i, outputSize).then((wasm) => {
          if (initParam > 512) {
            wasm.writeMemory(keyBuffer);
          }
          wasm.init(initParam);
          const obj = {
            init: initParam > 512 ? () => {
              wasm.writeMemory(keyBuffer);
              wasm.init(initParam);
              return obj;
            } : () => {
              wasm.init(initParam);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: outputSize
          };
          return obj;
        });
      }
      var name$h = "blake3";
      var data$h = "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IQEgAkFAaiICQcAASw0ACwsCQEHAACAHQf8BcSIGayIFIAIgBSACSRsiCUUNACAJQQNxIQtBACEFAkAgCUEESQ0AIAAgBmohByAJQfwAcSEIQQAhBQNAIAcgBWoiAkEoaiABIAVqIgotAAA6AAAgAkEpaiAKQQFqLQAAOgAAIAJBKmogCkECai0AADoAACACQStqIApBA2otAAA6AAAgCCAFQQRqIgVHDQALCwJAIAtFDQAgASAFaiEBIAUgBmogAGpBKGohBQNAIAUgAS0AADoAACABQQFqIQEgBUEBaiEFIAtBf2oiCw0ACwsgAC0AaCEHCyAAIAcgCWo6AGggA0HAAGokAAveAwQFfwN+BX8GfiMAQdABayIBJAACQCAAe6ciAkEALQCQigEiA08NAEEALQCKigFBBHIhBCABQShqIQVBACkDmIkBIQBBACkDkIkBIQZBACkDiIkBIQdBACkDgIkBIQggAyEJA0AgASAANwMYIAEgBjcDECABIAc3AwggASAINwMAIAEgA0EFdCIDQdGJAWoiCikDADcDKCABIANB2YkBaiILKQMANwMwIAEgA0HhiQFqIgwpAwA3AzggASADQemJAWoiDSkDADcDQCABIANB8YkBaikDADcDSCABIANB+YkBaikDADcDUCABIANBgYoBaikDADcDWCADQYmKAWopAwAhDiABQcAAOgBoIAEgDjcDYCABQgA3AyAgASAEOgBpIAEgADcDiAEgASAGNwOAASABIAc3A3ggASAINwNwIAFBkAFqIAFB8ABqIAVBwABCACAEQf8BcRACIAEpA7ABIQ4gASkDkAEhDyABKQO4ASEQIAEpA5gBIREgASkDwAEhEiABKQOgASETIA0gASkDyAEgASkDqAGFNwMAIAwgEiAThTcDACALIBAgEYU3AwAgCiAOIA+FNwMAIAlBf2oiCUH/AXEiAyACSw0AC0EAIAk6AJCKAQsgAUHQAWokAAvHCQIKfwV+IwBB4AJrIgUkAAJAAkAgAUGACEsNACAFIAA2AvwBIAVB/AFqIAFBgAhGIgZBECACQQEgA0EBQQIgBBABIAZBCnQiByABTw0BIAVB4ABqIgZCADcDACAFQdgAaiIIQgA3AwAgBUHQAGoiCUIANwMAIAVByABqIgpCADcDACAFQcAAaiILQgA3AwAgBUE4aiIMQgA3AwAgBUEwaiINQgA3AwAgBSADOgBqIAVCADcDKCAFQQA7AWggBUEAKQOAiQE3AwAgBUEAKQOIiQE3AwggBUEAKQOQiQE3AxAgBUEAKQOYiQE3AxggBSABQYAIRiIOrSACfDcDICAFIAAgB2pBACABIA4bEAQgBUGIAWpBMGogDSkDADcDACAFQYgBakE4aiAMKQMANwMAIAUgBSkDACIPNwOIASAFIAUpAwgiEDcDkAEgBSAFKQMQIhE3A5gBIAUgBSkDGCISNwOgASAFIAUpAyg3A7ABIAUtAGohACAFLQBpIQcgBSkDICECIAUtAGghASAFQYgBakHAAGogCykDADcDACAFQYgBakHIAGogCikDADcDACAFQYgBakHQAGogCSkDADcDACAFQYgBakHYAGogCCkDADcDACAFQYgBakHgAGogBikDADcDACAFIAE6APABIAUgAjcDqAEgBSAAIAdFckECciIAOgDxASAFIBI3A5gCIAUgETcDkAIgBSAQNwOIAiAFIA83A4ACIAVBoAJqIAVBgAJqIAVBsAFqIAEgAiAAQf8BcRACIAUpA8ACIQIgBSkDoAIhDyAFKQPIAiEQIAUpA6gCIREgBSkD0AIhEiAFKQOwAiETIAQgDkEFdGoiASAFKQPYAiAFKQO4AoU3AxggASASIBOFNwMQIAEgECARhTcDCCABIAIgD4U3AwBBAkEBIA4bIQYMAQsgAEIBIAFBf2pBCnZBAXKteUI/hYYiD6dBCnQiDiACIAMgBRAGIQcgACAOaiABIA5rIA9C////AYMgAnwgAyAFQcAAQSAgDkGACEsbahAGIQECQCAHQQFHDQAgBCAFKQMANwMAIAQgBSkDCDcDCCAEIAUpAxA3AxAgBCAFKQMYNwMYIAQgBSkDIDcDICAEIAUpAyg3AyggBCAFKQMwNwMwIAQgBSkDODcDOEECIQYMAQtBACEGQQAhAAJAIAEgB2oiCUECSQ0AIAlBfmoiCkEBdkEBaiIGQQNxIQ5BACEHAkAgCkEGSQ0AIAZB/P///wdxIQhBACEHIAVBiAFqIQEgBSEAA0AgASAANgIAIAFBDGogAEHAAWo2AgAgAUEIaiAAQYABajYCACABQQRqIABBwABqNgIAIABBgAJqIQAgAUEQaiEBIAggB0EEaiIHRw0ACwsgCkF+cSEIAkAgDkUNACAFIAdBBnRqIQEgBUGIAWogB0ECdGohAANAIAAgATYCACABQcAAaiEBIABBBGohACAOQX9qIg4NAAsLIAhBAmohAAsgBUGIAWogBkEBQgBBACADQQRyQQBBACAEEAEgACAJTw0AIAQgBkEFdGoiASAFIAZBBnRqIgApAwA3AwAgASAAKQMINwMIIAEgACkDEDcDECABIAApAxg3AxggBkEBaiEGCyAFQeACaiQAIAYLrRAIAn8EfgF/AX4EfwR+BH8EfiMAQfABayIBJAACQCAARQ0AAkBBAC0AkIoBIgINACABQTBqQQApA9CJATcDACABQThqQQApA9iJATcDACABQQApA6CJASIDNwMAIAFBACkDqIkBIgQ3AwggAUEAKQOwiQEiBTcDECABQQApA7iJASIGNwMYIAFBACkDyIkBNwMoQQAtAIqKASECQQAtAImKASEHQQApA8CJASEIQQAtAIiKASEJIAFBwABqQQApA+CJATcDACABQcgAakEAKQPoiQE3AwAgAUHQAGpBACkD8IkBNwMAIAFB2ABqQQApA/iJATcDACABQeAAakEAKQOAigE3AwAgASAJOgBoIAEgCDcDICABIAIgB0VyIgJBAnI6AGkgAUEoaiEKQgAhCEGACSELIAJBCnJB/wFxIQwDQCABQbABaiABIAogCUH/AXEgCCAMEAIgASABKQPQASINIAEpA7ABhTcDcCABIAEpA9gBIg4gASkDuAGFNwN4IAEgASkD4AEiDyABKQPAAYU3A4ABIAEgASkD6AEiECAGhTcDqAEgASAPIAWFNwOgASABIA4gBIU3A5gBIAEgDSADhTcDkAEgASAQIAEpA8gBhTcDiAEgAEHAACAAQcAASRsiEUF/aiESAkACQCARQQdxIhMNACABQfAAaiECIAshByARIRQMAQsgEUH4AHEhFCABQfAAaiECIAshBwNAIAcgAi0AADoAACAHQQFqIQcgAkEBaiECIBNBf2oiEw0ACwsCQCASQQdJDQADQCAHIAIpAAA3AAAgB0EIaiEHIAJBCGohAiAUQXhqIhQNAAsLIAhCAXwhCCALIBFqIQsgACARayIADQAMAgsLAkACQAJAQQAtAImKASIHQQZ0QQBBAC0AiIoBIhFrRg0AIAEgEToAaCABQQApA4CKATcDYCABQQApA/iJATcDWCABQQApA/CJATcDUCABQQApA+iJATcDSCABQQApA+CJATcDQCABQQApA9iJATcDOCABQQApA9CJATcDMCABQQApA8iJATcDKCABQQApA8CJASIINwMgIAFBACkDuIkBIgM3AxggAUEAKQOwiQEiBDcDECABQQApA6iJASIFNwMIIAFBACkDoIkBIgY3AwAgAUEALQCKigEiEyAHRXJBAnIiCzoAaSATQQRyIRNBACkDmIkBIQ1BACkDkIkBIQ5BACkDiIkBIQ9BACkDgIkBIRAMAQtBwAAhESABQcAAOgBoQgAhCCABQgA3AyAgAUEAKQOYiQEiDTcDGCABQQApA5CJASIONwMQIAFBACkDiIkBIg83AwggAUEAKQOAiQEiEDcDACABQQAtAIqKAUEEciITOgBpIAEgAkF+aiICQQV0IgdByYoBaikDADcDYCABIAdBwYoBaikDADcDWCABIAdBuYoBaikDADcDUCABIAdBsYoBaikDADcDSCABIAdBqYoBaikDADcDQCABIAdBoYoBaikDADcDOCABIAdBmYoBaikDADcDMCABIAdBkYoBaikDADcDKCATIQsgECEGIA8hBSAOIQQgDSEDIAJFDQELIAJBf2oiB0EFdCIUQZGKAWopAwAhFSAUQZmKAWopAwAhFiAUQaGKAWopAwAhFyAUQamKAWopAwAhGCABIAM3A4gBIAEgBDcDgAEgASAFNwN4IAEgBjcDcCABQbABaiABQfAAaiABQShqIhQgESAIIAtB/wFxEAIgASATOgBpIAFBwAA6AGggASAYNwNAIAEgFzcDOCABIBY3AzAgASAVNwMoIAFCADcDICABIA03AxggASAONwMQIAEgDzcDCCABIBA3AwAgASABKQPoASABKQPIAYU3A2AgASABKQPgASABKQPAAYU3A1ggASABKQPYASABKQO4AYU3A1AgASABKQPQASABKQOwAYU3A0ggB0UNACACQQV0QemJAWohAiATQf8BcSERA0AgAkFoaikDACEIIAJBcGopAwAhAyACQXhqKQMAIQQgAikDACEFIAEgDTcDiAEgASAONwOAASABIA83A3ggASAQNwNwIAFBsAFqIAFB8ABqIBRBwABCACAREAIgASATOgBpIAFBwAA6AGggASAFNwNAIAEgBDcDOCABIAM3AzAgASAINwMoIAFCADcDICABIA03AxggASAONwMQIAEgDzcDCCABIBA3AwAgASABKQPoASABKQPIAYU3A2AgASABKQPgASABKQPAAYU3A1ggASABKQPYASABKQO4AYU3A1AgASABKQPQASABKQOwAYU3A0ggAkFgaiECIAdBf2oiBw0ACwsgAUEoaiEJQgAhCEGACSELIBNBCHJB/wFxIQoDQCABQbABaiABIAlBwAAgCCAKEAIgASABKQPQASIDIAEpA7ABhTcDcCABIAEpA9gBIgQgASkDuAGFNwN4IAEgASkD4AEiBSABKQPAAYU3A4ABIAEgDSABKQPoASIGhTcDqAEgASAOIAWFNwOgASABIA8gBIU3A5gBIAEgECADhTcDkAEgASAGIAEpA8gBhTcDiAEgAEHAACAAQcAASRsiEUF/aiESAkACQCARQQdxIhMNACABQfAAaiECIAshByARIRQMAQsgEUH4AHEhFCABQfAAaiECIAshBwNAIAcgAi0AADoAACAHQQFqIQcgAkEBaiECIBNBf2oiEw0ACwsCQCASQQdJDQADQCAHIAIpAAA3AAAgB0EIaiEHIAJBCGohAiAUQXhqIhQNAAsLIAhCAXwhCCALIBFqIQsgACARayIADQALCyABQfABaiQAC6MCAQR+AkACQCAAQSBGDQBCq7OP/JGjs/DbACEBQv+kuYjFkdqCm38hAkLy5rvjo6f9p6V/IQNC58yn0NbQ67O7fyEEQQAhAAwBC0EAKQOYCSEBQQApA5AJIQJBACkDiAkhA0EAKQOACSEEQRAhAAtBACAAOgCKigFBAEIANwOAigFBAEIANwP4iQFBAEIANwPwiQFBAEIANwPoiQFBAEIANwPgiQFBAEIANwPYiQFBAEIANwPQiQFBAEIANwPIiQFBAEIANwPAiQFBACABNwO4iQFBACACNwOwiQFBACADNwOoiQFBACAENwOgiQFBACABNwOYiQFBACACNwOQiQFBACADNwOIiQFBACAENwOAiQFBAEEAOgCQigFBAEEAOwGIigELBgAgABADCwYAIAAQBwsGAEGAiQELqwIBBH4CQAJAIAFBIEYNAEKrs4/8kaOz8NsAIQNC/6S5iMWR2oKbfyEEQvLmu+Ojp/2npX8hBULnzKfQ1tDrs7t/IQZBACEBDAELQQApA5gJIQNBACkDkAkhBEEAKQOICSEFQQApA4AJIQZBECEBC0EAIAE6AIqKAUEAQgA3A4CKAUEAQgA3A/iJAUEAQgA3A/CJAUEAQgA3A+iJAUEAQgA3A+CJAUEAQgA3A9iJAUEAQgA3A9CJAUEAQgA3A8iJAUEAQgA3A8CJAUEAIAM3A7iJAUEAIAQ3A7CJAUEAIAU3A6iJAUEAIAY3A6CJAUEAIAM3A5iJAUEAIAQ3A5CJAUEAIAU3A4iJAUEAIAY3A4CJAUEAQQA6AJCKAUEAQQA7AYiKASAAEAMgAhAHCwsLAQBBgAgLBHgHAAA=";
      var hash$h = "215d875f";
      var wasmJson$h = {
        name: name$h,
        data: data$h,
        hash: hash$h
      };
      const mutex$i = new Mutex();
      let wasmCache$i = null;
      function validateBits$2(bits) {
        if (!Number.isInteger(bits) || bits < 8 || bits % 8 !== 0) {
          return new Error("Invalid variant! Valid values: 8, 16, ...");
        }
        return null;
      }
      function blake3(data2, bits = 256, key = null) {
        if (validateBits$2(bits)) {
          return Promise.reject(validateBits$2(bits));
        }
        let keyBuffer = null;
        let initParam = 0;
        if (key !== null) {
          keyBuffer = getUInt8Buffer(key);
          if (keyBuffer.length !== 32) {
            return Promise.reject(new Error("Key length must be exactly 32 bytes"));
          }
          initParam = 32;
        }
        const hashLength = bits / 8;
        const digestParam = hashLength;
        if (wasmCache$i === null || wasmCache$i.hashLength !== hashLength) {
          return lockedCreate(mutex$i, wasmJson$h, hashLength).then((wasm) => {
            wasmCache$i = wasm;
            if (initParam === 32) {
              wasmCache$i.writeMemory(keyBuffer);
            }
            return wasmCache$i.calculate(data2, initParam, digestParam);
          });
        }
        try {
          if (initParam === 32) {
            wasmCache$i.writeMemory(keyBuffer);
          }
          const hash2 = wasmCache$i.calculate(data2, initParam, digestParam);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createBLAKE3(bits = 256, key = null) {
        if (validateBits$2(bits)) {
          return Promise.reject(validateBits$2(bits));
        }
        let keyBuffer = null;
        let initParam = 0;
        if (key !== null) {
          keyBuffer = getUInt8Buffer(key);
          if (keyBuffer.length !== 32) {
            return Promise.reject(new Error("Key length must be exactly 32 bytes"));
          }
          initParam = 32;
        }
        const outputSize = bits / 8;
        const digestParam = outputSize;
        return WASMInterface(wasmJson$h, outputSize).then((wasm) => {
          if (initParam === 32) {
            wasm.writeMemory(keyBuffer);
          }
          wasm.init(initParam);
          const obj = {
            init: initParam === 32 ? () => {
              wasm.writeMemory(keyBuffer);
              wasm.init(initParam);
              return obj;
            } : () => {
              wasm.init(initParam);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType, digestParam),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: outputSize
          };
          return obj;
        });
      }
      var name$g = "crc32";
      var data$g = "AGFzbQEAAAABEQRgAAF/YAF/AGAAAGACf38AAwgHAAEBAQIAAwUEAQECAgYOAn8BQZDJBQt/AEGACAsHcAgGbWVtb3J5AgAOSGFzaF9HZXRCdWZmZXIAAAlIYXNoX0luaXQAAgtIYXNoX1VwZGF0ZQADCkhhc2hfRmluYWwABA1IYXNoX0dldFN0YXRlAAUOSGFzaF9DYWxjdWxhdGUABgpTVEFURV9TSVpFAwEKkggHBQBBgAkLwwMBA39BgIkBIQFBACECA0AgAUEAQQBBAEEAQQBBAEEAQQAgAkEBcWsgAHEgAkEBdnMiA0EBcWsgAHEgA0EBdnMiA0EBcWsgAHEgA0EBdnMiA0EBcWsgAHEgA0EBdnMiA0EBcWsgAHEgA0EBdnMiA0EBcWsgAHEgA0EBdnMiA0EBcWsgAHEgA0EBdnMiA0EBcWsgAHEgA0EBdnM2AgAgAUEEaiEBIAJBAWoiAkGAAkcNAAtBACEAA0AgAEGEkQFqIABBhIkBaigCACICQf8BcUECdEGAiQFqKAIAIAJBCHZzIgI2AgAgAEGEmQFqIAJB/wFxQQJ0QYCJAWooAgAgAkEIdnMiAjYCACAAQYShAWogAkH/AXFBAnRBgIkBaigCACACQQh2cyICNgIAIABBhKkBaiACQf8BcUECdEGAiQFqKAIAIAJBCHZzIgI2AgAgAEGEsQFqIAJB/wFxQQJ0QYCJAWooAgAgAkEIdnMiAjYCACAAQYS5AWogAkH/AXFBAnRBgIkBaigCACACQQh2cyICNgIAIABBhMEBaiACQf8BcUECdEGAiQFqKAIAIAJBCHZzNgIAIABBBGoiAEH8B0cNAAsLJwACQEEAKAKAyQEgAEYNACAAEAFBACAANgKAyQELQQBBADYChMkBC4gDAQN/QQAoAoTJAUF/cyEBQYAJIQICQCAAQQhJDQBBgAkhAgNAIAJBBGooAgAiA0EOdkH8B3FBgJEBaigCACADQRZ2QfwHcUGAiQFqKAIAcyADQQZ2QfwHcUGAmQFqKAIAcyADQf8BcUECdEGAoQFqKAIAcyACKAIAIAFzIgFBFnZB/AdxQYCpAWooAgBzIAFBDnZB/AdxQYCxAWooAgBzIAFBBnZB/AdxQYC5AWooAgBzIAFB/wFxQQJ0QYDBAWooAgBzIQEgAkEIaiECIABBeGoiAEEHSw0ACwsCQCAARQ0AAkACQCAAQQFxDQAgACEDDAELIAFB/wFxIAItAABzQQJ0QYCJAWooAgAgAUEIdnMhASACQQFqIQIgAEF/aiEDCyAAQQFGDQADQCABQf8BcSACLQAAc0ECdEGAiQFqKAIAIAFBCHZzIgFB/wFxIAJBAWotAABzQQJ0QYCJAWooAgAgAUEIdnMhASACQQJqIQIgA0F+aiIDDQALC0EAIAFBf3M2AoTJAQsyAQF/QQBBACgChMkBIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgKACQsGAEGEyQELWQACQEEAKAKAyQEgAUYNACABEAFBACABNgKAyQELQQBBADYChMkBIAAQA0EAQQAoAoTJASIBQRh0IAFBgP4DcUEIdHIgAUEIdkGA/gNxIAFBGHZycjYCgAkLCwsBAEGACAsEBAAAAA==";
      var hash$g = "d2eba587";
      var wasmJson$g = {
        name: name$g,
        data: data$g,
        hash: hash$g
      };
      const mutex$h = new Mutex();
      let wasmCache$h = null;
      function validatePoly(poly) {
        if (!Number.isInteger(poly) || poly < 0 || poly > 4294967295) {
          return new Error("Polynomial must be a valid 32-bit long unsigned integer");
        }
        return null;
      }
      function crc32(data2, polynomial = 3988292384) {
        if (validatePoly(polynomial)) {
          return Promise.reject(validatePoly(polynomial));
        }
        if (wasmCache$h === null) {
          return lockedCreate(mutex$h, wasmJson$g, 4).then((wasm) => {
            wasmCache$h = wasm;
            return wasmCache$h.calculate(data2, polynomial);
          });
        }
        try {
          const hash2 = wasmCache$h.calculate(data2, polynomial);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createCRC32(polynomial = 3988292384) {
        if (validatePoly(polynomial)) {
          return Promise.reject(validatePoly(polynomial));
        }
        return WASMInterface(wasmJson$g, 4).then((wasm) => {
          wasm.init(polynomial);
          const obj = {
            init: () => {
              wasm.init(polynomial);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 4,
            digestSize: 4
          };
          return obj;
        });
      }
      var name$f = "crc64";
      var data$f = "AGFzbQEAAAABDANgAAF/YAAAYAF/AAMHBgABAgEAAQUEAQECAgYOAn8BQZCJBgt/AEGACAsHcAgGbWVtb3J5AgAOSGFzaF9HZXRCdWZmZXIAAAlIYXNoX0luaXQAAQtIYXNoX1VwZGF0ZQACCkhhc2hfRmluYWwAAw1IYXNoX0dldFN0YXRlAAQOSGFzaF9DYWxjdWxhdGUABQpTVEFURV9TSVpFAwEKgwgGBQBBgAkL9QMDAX4BfwJ+AkBBACkDgIkCQQApA4AJIgBRDQBBgIkBIQFCACECA0AgAUIAQgBCAEIAQgBCAEIAQgAgAkIBg30gAIMgAkIBiIUiA0IBg30gAIMgA0IBiIUiA0IBg30gAIMgA0IBiIUiA0IBg30gAIMgA0IBiIUiA0IBg30gAIMgA0IBiIUiA0IBg30gAIMgA0IBiIUiA0IBg30gAIMgA0IBiIUiA0IBg30gAIMgA0IBiIU3AwAgAUEIaiEBIAJCAXwiAkKAAlINAAtBACEBA0AgAUGImQFqIAFBiIkBaikDACICp0H/AXFBA3RBgIkBaikDACACQgiIhSICNwMAIAFBiKkBaiACp0H/AXFBA3RBgIkBaikDACACQgiIhSICNwMAIAFBiLkBaiACp0H/AXFBA3RBgIkBaikDACACQgiIhSICNwMAIAFBiMkBaiACp0H/AXFBA3RBgIkBaikDACACQgiIhSICNwMAIAFBiNkBaiACp0H/AXFBA3RBgIkBaikDACACQgiIhSICNwMAIAFBiOkBaiACp0H/AXFBA3RBgIkBaikDACACQgiIhSICNwMAIAFBiPkBaiACp0H/AXFBA3RBgIkBaikDACACQgiIhTcDACABQQhqIgFB+A9HDQALQQAgADcDgIkCC0EAQgA3A4iJAguUAwIBfgJ/QQApA4iJAkJ/hSEBQYAJIQICQCAAQQhJDQBBgAkhAgNAIAIpAwAgAYUiAUIwiKdB/wFxQQN0QYCZAWopAwAgAUI4iKdBA3RBgIkBaikDAIUgAUIoiKdB/wFxQQN0QYCpAWopAwCFIAFCIIinQf8BcUEDdEGAuQFqKQMAhSABpyIDQRV2QfgPcUGAyQFqKQMAhSADQQ12QfgPcUGA2QFqKQMAhSADQQV2QfgPcUGA6QFqKQMAhSADQf8BcUEDdEGA+QFqKQMAhSEBIAJBCGohAiAAQXhqIgBBB0sNAAsLAkAgAEUNAAJAAkAgAEEBcQ0AIAAhAwwBCyABQv8BgyACMQAAhadBA3RBgIkBaikDACABQgiIhSEBIAJBAWohAiAAQX9qIQMLIABBAUYNAANAIAFC/wGDIAIxAACFp0EDdEGAiQFqKQMAIAFCCIiFIgFC/wGDIAJBAWoxAACFp0EDdEGAiQFqKQMAIAFCCIiFIQEgAkECaiECIANBfmoiAw0ACwtBACABQn+FNwOIiQILZAEBfkEAQQApA4iJAiIAQjiGIABCgP4Dg0IohoQgAEKAgPwHg0IYhiAAQoCAgPgPg0IIhoSEIABCCIhCgICA+A+DIABCGIhCgID8B4OEIABCKIhCgP4DgyAAQjiIhISENwOACQsGAEGIiQILAgALCwsBAEGACAsECAAAAA==";
      var hash$f = "c5ac6c16";
      var wasmJson$f = {
        name: name$f,
        data: data$f,
        hash: hash$f
      };
      const mutex$g = new Mutex();
      let wasmCache$g = null;
      const polyBuffer = new Uint8Array(8);
      function parsePoly(poly) {
        const errText = "Polynomial must be provided as a 16 char long hex string";
        if (typeof poly !== "string" || poly.length !== 16) {
          return { hi: 0, lo: 0, err: new Error(errText) };
        }
        const hi = Number(`0x${poly.slice(0, 8)}`);
        const lo = Number(`0x${poly.slice(8)}`);
        if (Number.isNaN(hi) || Number.isNaN(lo)) {
          return { hi, lo, err: new Error(errText) };
        }
        return { hi, lo, err: null };
      }
      function writePoly(arr, lo, hi) {
        const buffer = new DataView(arr);
        buffer.setUint32(0, lo, true);
        buffer.setUint32(4, hi, true);
      }
      function crc64(data2, polynomial = "c96c5795d7870f42") {
        const { hi, lo, err } = parsePoly(polynomial);
        if (err !== null) {
          return Promise.reject(err);
        }
        if (wasmCache$g === null) {
          return lockedCreate(mutex$g, wasmJson$f, 8).then((wasm) => {
            wasmCache$g = wasm;
            writePoly(polyBuffer.buffer, lo, hi);
            wasmCache$g.writeMemory(polyBuffer);
            return wasmCache$g.calculate(data2);
          });
        }
        try {
          writePoly(polyBuffer.buffer, lo, hi);
          wasmCache$g.writeMemory(polyBuffer);
          const hash2 = wasmCache$g.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err2) {
          return Promise.reject(err2);
        }
      }
      function createCRC64(polynomial = "c96c5795d7870f42") {
        const { hi, lo, err } = parsePoly(polynomial);
        if (err !== null) {
          return Promise.reject(err);
        }
        return WASMInterface(wasmJson$f, 8).then((wasm) => {
          const instanceBuffer = new Uint8Array(8);
          writePoly(instanceBuffer.buffer, lo, hi);
          wasm.writeMemory(instanceBuffer);
          wasm.init();
          const obj = {
            init: () => {
              wasm.writeMemory(instanceBuffer);
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 8,
            digestSize: 8
          };
          return obj;
        });
      }
      var name$e = "md4";
      var data$e = "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";
      var hash$e = "bd8ce7c7";
      var wasmJson$e = {
        name: name$e,
        data: data$e,
        hash: hash$e
      };
      const mutex$f = new Mutex();
      let wasmCache$f = null;
      function md4(data2) {
        if (wasmCache$f === null) {
          return lockedCreate(mutex$f, wasmJson$e, 16).then((wasm) => {
            wasmCache$f = wasm;
            return wasmCache$f.calculate(data2);
          });
        }
        try {
          const hash2 = wasmCache$f.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createMD4() {
        return WASMInterface(wasmJson$e, 16).then((wasm) => {
          wasm.init();
          const obj = {
            init: () => {
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: 16
          };
          return obj;
        });
      }
      var name$d = "md5";
      var data$d = "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";
      var hash$d = "e6508e4b";
      var wasmJson$d = {
        name: name$d,
        data: data$d,
        hash: hash$d
      };
      const mutex$e = new Mutex();
      let wasmCache$e = null;
      function md52(data2) {
        if (wasmCache$e === null) {
          return lockedCreate(mutex$e, wasmJson$d, 16).then((wasm) => {
            wasmCache$e = wasm;
            return wasmCache$e.calculate(data2);
          });
        }
        try {
          const hash2 = wasmCache$e.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createMD5() {
        return WASMInterface(wasmJson$d, 16).then((wasm) => {
          wasm.init();
          const obj = {
            init: () => {
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: 16
          };
          return obj;
        });
      }
      var name$c = "sha1";
      var data$c = "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";
      var hash$c = "6b530c24";
      var wasmJson$c = {
        name: name$c,
        data: data$c,
        hash: hash$c
      };
      const mutex$d = new Mutex();
      let wasmCache$d = null;
      function sha1(data2) {
        if (wasmCache$d === null) {
          return lockedCreate(mutex$d, wasmJson$c, 20).then((wasm) => {
            wasmCache$d = wasm;
            return wasmCache$d.calculate(data2);
          });
        }
        try {
          const hash2 = wasmCache$d.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createSHA1() {
        return WASMInterface(wasmJson$c, 20).then((wasm) => {
          wasm.init();
          const obj = {
            init: () => {
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: 20
          };
          return obj;
        });
      }
      var name$b = "sha3";
      var data$b = "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";
      var hash$b = "fb24e536";
      var wasmJson$b = {
        name: name$b,
        data: data$b,
        hash: hash$b
      };
      const mutex$c = new Mutex();
      let wasmCache$c = null;
      function validateBits$1(bits) {
        if (![224, 256, 384, 512].includes(bits)) {
          return new Error("Invalid variant! Valid values: 224, 256, 384, 512");
        }
        return null;
      }
      function sha3(data2, bits = 512) {
        if (validateBits$1(bits)) {
          return Promise.reject(validateBits$1(bits));
        }
        const hashLength = bits / 8;
        if (wasmCache$c === null || wasmCache$c.hashLength !== hashLength) {
          return lockedCreate(mutex$c, wasmJson$b, hashLength).then((wasm) => {
            wasmCache$c = wasm;
            return wasmCache$c.calculate(data2, bits, 6);
          });
        }
        try {
          const hash2 = wasmCache$c.calculate(data2, bits, 6);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createSHA3(bits = 512) {
        if (validateBits$1(bits)) {
          return Promise.reject(validateBits$1(bits));
        }
        const outputSize = bits / 8;
        return WASMInterface(wasmJson$b, outputSize).then((wasm) => {
          wasm.init(bits);
          const obj = {
            init: () => {
              wasm.init(bits);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType, 6),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 200 - 2 * outputSize,
            digestSize: outputSize
          };
          return obj;
        });
      }
      const mutex$b = new Mutex();
      let wasmCache$b = null;
      function validateBits(bits) {
        if (![224, 256, 384, 512].includes(bits)) {
          return new Error("Invalid variant! Valid values: 224, 256, 384, 512");
        }
        return null;
      }
      function keccak(data2, bits = 512) {
        if (validateBits(bits)) {
          return Promise.reject(validateBits(bits));
        }
        const hashLength = bits / 8;
        if (wasmCache$b === null || wasmCache$b.hashLength !== hashLength) {
          return lockedCreate(mutex$b, wasmJson$b, hashLength).then((wasm) => {
            wasmCache$b = wasm;
            return wasmCache$b.calculate(data2, bits, 1);
          });
        }
        try {
          const hash2 = wasmCache$b.calculate(data2, bits, 1);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createKeccak(bits = 512) {
        if (validateBits(bits)) {
          return Promise.reject(validateBits(bits));
        }
        const outputSize = bits / 8;
        return WASMInterface(wasmJson$b, outputSize).then((wasm) => {
          wasm.init(bits);
          const obj = {
            init: () => {
              wasm.init(bits);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType, 1),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 200 - 2 * outputSize,
            digestSize: outputSize
          };
          return obj;
        });
      }
      var name$a = "sha256";
      var data$a = "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c2pBx6KerX1qIhkgASADcyACcSABIANxcyABQR53IAFBE3dzIAFBCndzaiAaaiICaiIJIBMgEnNxIBJzaiAJQRp3IAlBFXdzIAlBB3dzakHRxqk2aiIaIAIgAXMgA3EgAiABcXMgAkEedyACQRN3cyACQQp3c2ogGGoiA2oiESAJIBNzcSATc2ogEUEadyARQRV3cyARQQd3c2pB59KkoQFqIhggAyACcyABcSADIAJxcyADQR53IANBE3dzIANBCndzaiAUaiIBaiISIBEgCXNxIAlzaiASQRp3IBJBFXdzIBJBB3dzakGFldy9AmoiFCABIANzIAJxIAEgA3FzIAFBHncgAUETd3MgAUEKd3NqIBdqIgJqIhMgI2ogJiASaiAiIBFqICUgCWogEyASIBFzcSARc2ogE0EadyATQRV3cyATQQd3c2pBuMLs8AJqIhcgAiABcyADcSACIAFxcyACQR53IAJBE3dzIAJBCndzaiAZaiIDaiIJIBMgEnNxIBJzaiAJQRp3IAlBFXdzIAlBB3dzakH827HpBGoiGSADIAJzIAFxIAMgAnFzIANBHncgA0ETd3MgA0EKd3NqIBpqIgFqIhEgCSATc3EgE3NqIBFBGncgEUEVd3MgEUEHd3NqQZOa4JkFaiIaIAEgA3MgAnEgASADcXMgAUEedyABQRN3cyABQQp3c2ogGGoiAmoiEiARIAlzcSAJc2ogEkEadyASQRV3cyASQQd3c2pB1OapqAZqIhggAiABcyADcSACIAFxcyACQR53IAJBE3dzIAJBCndzaiAUaiIDaiITaiAoIBJqICQgEWogJyAJaiATIBIgEXNxIBFzaiATQRp3IBNBFXdzIBNBB3dzakG7laizB2oiFCADIAJzIAFxIAMgAnFzIANBHncgA0ETd3MgA0EKd3NqIBdqIgFqIgkgEyASc3EgEnNqIAlBGncgCUEVd3MgCUEHd3NqQa6Si454aiIXIAEgA3MgAnEgASADcXMgAUEedyABQRN3cyABQQp3c2ogGWoiAmoiESAJIBNzcSATc2ogEUEadyARQRV3cyARQQd3c2pBhdnIk3lqIhkgAiABcyADcSACIAFxcyACQR53IAJBE3dzIAJBCndzaiAaaiIDaiISIBEgCXNxIAlzaiASQRp3IBJBFXdzIBJBB3dzakGh0f+VemoiGiADIAJz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";
      var hash$a = "8c18dd94";
      var wasmJson$a = {
        name: name$a,
        data: data$a,
        hash: hash$a
      };
      const mutex$a = new Mutex();
      let wasmCache$a = null;
      function sha224(data2) {
        if (wasmCache$a === null) {
          return lockedCreate(mutex$a, wasmJson$a, 28).then((wasm) => {
            wasmCache$a = wasm;
            return wasmCache$a.calculate(data2, 224);
          });
        }
        try {
          const hash2 = wasmCache$a.calculate(data2, 224);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createSHA224() {
        return WASMInterface(wasmJson$a, 28).then((wasm) => {
          wasm.init(224);
          const obj = {
            init: () => {
              wasm.init(224);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: 28
          };
          return obj;
        });
      }
      const mutex$9 = new Mutex();
      let wasmCache$9 = null;
      function sha256(data2) {
        if (wasmCache$9 === null) {
          return lockedCreate(mutex$9, wasmJson$a, 32).then((wasm) => {
            wasmCache$9 = wasm;
            return wasmCache$9.calculate(data2, 256);
          });
        }
        try {
          const hash2 = wasmCache$9.calculate(data2, 256);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createSHA256() {
        return WASMInterface(wasmJson$a, 32).then((wasm) => {
          wasm.init(256);
          const obj = {
            init: () => {
              wasm.init(256);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: 32
          };
          return obj;
        });
      }
      var name$9 = "sha512";
      var data$9 = "AGFzbQEAAAABEQRgAAF/YAF/AGAAAGACf38AAwgHAAEBAQIAAwUEAQECAgYOAn8BQdCKBQt/AEGACAsHcAgGbWVtb3J5AgAOSGFzaF9HZXRCdWZmZXIAAAlIYXNoX0luaXQAAQtIYXNoX1VwZGF0ZQACCkhhc2hfRmluYWwABA1IYXNoX0dldFN0YXRlAAUOSGFzaF9DYWxjdWxhdGUABgpTVEFURV9TSVpFAwEKlWgHBQBBgAkLmwIAQQBCADcDgIoBQQBBMEHAACAAQYADRiIAGzYCyIoBQQBCpJ/p99uD0trHAEL5wvibkaOz8NsAIAAbNwPAigFBAEKnn+an1sGLhltC6/qG2r+19sEfIAAbNwO4igFBAEKRquDC9tCS2o5/Qp/Y+dnCkdqCm38gABs3A7CKAUEAQrGWgP7/zMmZ5wBC0YWa7/rPlIfRACAAGzcDqIoBQQBCubK5uI+b+5cVQvHt9Pilp/2npX8gABs3A6CKAUEAQpe6w4Ojq8CskX9Cq/DT9K/uvLc8IAAbNwOYigFBAEKHqvOzo6WKzeIAQrvOqqbY0Ouzu38gABs3A5CKAUEAQti9lojcq+fdS0KIkvOd/8z5hOoAIAAbNwOIigEL8gICAX4Gf0EAQQApA4CKASIBIACtfDcDgIoBAkACQAJAIAGnQf8AcSICDQBBgAkhAwwBCwJAQYABIAJrIgQgACAEIABJGyIDRQ0AIANBA3EhBSACQYCJAWohBkEAIQICQCADQQRJDQAgA0H8AXEhB0EAIQIDQCAGIAJqIgMgAkGACWotAAA6AAAgA0EBaiACQYEJai0AADoAACADQQJqIAJBgglqLQAAOgAAIANBA2ogAkGDCWotAAA6AAAgByACQQRqIgJHDQALCyAFRQ0AA0AgBiACaiACQYAJai0AADoAACACQQFqIQIgBUF/aiIFDQALCyAAIARJDQFBgIkBEAMgACAEayEAIARBgAlqIQMLAkAgAEGAAUkNAANAIAMQAyADQYABaiEDIABBgH9qIgBB/wBLDQALCyAARQ0AQQAhAkEAIQUDQCACQYCJAWogAyACai0AADoAACACQQFqIQIgACAFQQFqIgVB/wFxSw0ACwsL3FYBVn5BACAAKQMIIgFCOIYgAUKA/gODQiiGhCABQoCA/AeDQhiGIAFCgICA+A+DQgiGhIQgAUIIiEKAgID4D4MgAUIYiEKAgPwHg4QgAUIoiEKA/gODIAFCOIiEhIQiAkI/iSACQjiJhSACQgeIhSAAKQMAIgFCOIYgAUKA/gODQiiGhCABQoCA/AeDQhiGIAFCgICA+A+DQgiGhIQgAUIIiEKAgID4D4MgAUIYiEKAgPwHg4QgAUIoiEKA/gODIAFCOIiEhIQiA3wgACkDSCIBQjiGIAFCgP4Dg0IohoQgAUKAgPwHg0IYhiABQoCAgPgPg0IIhoSEIAFCCIhCgICA+A+DIAFCGIhCgID8B4OEIAFCKIhCgP4DgyABQjiIhISEIgR8IAApA3AiAUI4hiABQoD+A4NCKIaEIAFCgID8B4NCGIYgAUKAgID4D4NCCIaEhCABQgiIQoCAgPgPgyABQhiIQoCA/AeDhCABQiiIQoD+A4MgAUI4iISEhCIFQi2JIAVCA4mFIAVCBoiFfCIGQj+JIAZCOImFIAZCB4iFIAApA3giAUI4hiABQoD+A4NCKIaEIAFCgID8B4NCGIYgAUKAgID4D4NCCIaEhCABQgiIQoCAgPgPgyABQhiIQoCA/AeDhCABQiiIQoD+A4MgAUI4iISEhCIHfCAEQj+JIARCOImFIARCB4iFIAApA0AiAUI4hiABQoD+A4NCKIaEIAFCgID8B4NCGIYgAUKAgID4D4NCCIaEhCABQgiIQoCAgPgPgyABQhiIQoCA/AeDhCABQiiIQoD+A4MgAUI4iISEhCIIfCAAKQMQIgFCOIYgAUKA/gODQiiGhCABQoCA/AeDQhiGIAFCgICA+A+DQgiGhIQgAUIIiEKAgID4D4MgAUIYiEKAgPwHg4QgAUIoiEKA/gODIAFCOIiEhIQiCUI/iSAJQjiJhSAJQgeIhSACfCAAKQNQIgFCOIYgAUKA/gODQiiGhCABQoCA/AeDQhiGIAFCgICA+A+DQgiGhIQgAUIIiEKAgID4D4MgAUIYiEKAgPwHg4QgAUIoiEKA/gODIAFCOIiEhIQiCnwgB0ItiSAHQgOJhSAHQgaIhXwiC3wgACkDOCIBQjiGIAFCgP4Dg0IohoQgAUKAgPwHg0IYhiABQoCAgPgPg0IIhoSEIAFCCIhCgICA+A+DIAFCGIhCgID8B4OEIAFCKIhCgP4DgyABQjiIhISEIgxCP4kgDEI4iYUgDEIHiIUgACkDMCIBQjiGIAFCgP4Dg0IohoQgAUKAgPwHg0IYhiABQoCAgPgPg0IIhoSEIAFCCIhCgICA+A+DIAFCGIhCgID8B4OEIAFCKIhCgP4DgyABQjiIhISEIg18IAd8IAApAygiAUI4hiABQoD+A4NCKIaEIAFCgID8B4NCGIYgAUKAgID4D4NCCIaEhCABQgiIQoCAgPgPgyABQhiIQoCA/AeDhCABQiiIQoD+A4MgAUI4iISEhCIOQj+JIA5COImFIA5CB4iFIAApAyAiAUI4hiABQoD+A4NCKIaEIAFCgID8B4NCGIYgAUKAgID4D4NCCIaEhCABQgiIQoCAgPgPgyABQhiIQoCA/AeDhCABQiiIQoD+A4MgAUI4iISEhCIPfCAAKQNoIgFCOIYgAUKA/gODQiiGhCABQoCA/AeDQhiGIAFCgICA+A+DQgiGhIQgAUIIiEKAgID4D4MgAUIYiEKAgPwHg4QgAUIoiEKA/gODIAFCOIiEhIQiEHwgACkDGCIBQjiGIAFCgP4Dg0IohoQgAUKAgPwHg0IYhiABQoCAgPgPg0IIhoSEIAFCCIhCgICA+A+DIAFCGIhCgID8B4OEIAFCKIhCgP4DgyABQjiIhISEIhFCP4kgEUI4iYUgEUIHiIUgCXwgACkDWCIBQjiGIAFCgP4Dg0IohoQgAUKAgPwHg0IYhiABQoCAgPgPg0IIhoSEIAFCCIhCgICA+A+DIAFCGIhCgID8B4OEIAFCKIhCgP4DgyABQjiIhISEIhJ8IAZCLYkgBkIDiYUgBkIGiIV8IhNCLYkgE0IDiYUgE0IGiIV8IhRCLYkgFEIDiYUgFEIGiIV8IhVCLYkgFUIDiYUgFUIGiIV8IhZ8IAVCP4kgBUI4iYUgBUIHiIUgEHwgFXwgACkDYCIBQjiGIAFCgP4Dg0IohoQgAUKAgPwHg0IYhiABQoCAgPgPg0IIhoSEIAFCCIhCgICA+A+DIAFCGIhCgID8B4OEIAFCKIhCgP4DgyABQjiIhISEIhdCP4kgF0I4iYUgF0IHiIUgEnwgFHwgCkI/iSAKQjiJhSAKQgeIhSAEfCATfCAIQj+JIAhCOImFIAhCB4iFIAx8IAZ8IA1CP4kgDUI4iYUgDUIHiIUgDnwgBXwgD0I/iSAPQjiJhSAPQgeIhSARfCAXfCALQi2JIAtCA4mFIAtCBoiFfCIYQi2JIBhCA4mFIBhCBoiFfCIZQi2JIBlCA4mFIBlCBoiFfCIaQi2JIBpCA4mFIBpCBoiFfCIbQi2JIBtCA4mFIBtCBoiFfCIcQi2JIBxCA4mFIBxCBoiFfCIdQi2JIB1CA4mFIB1CBoiFfCIeQj+JIB5COImFIB5CB4iFIAdCP4kgB0I4iYUgB0IHiIUgBXwgGnwgEEI/iSAQQjiJhSAQQgeIhSAXfCAZfCASQj+JIBJCOImFIBJCB4iFIAp8IBh8IBZCLYkgFkIDiYUgFkIGiIV8Ih9CLYkgH0IDiYUgH0IGiIV8IiBCLYkgIEIDiYUgIEIGiIV8IiF8IBZCP4kgFkI4iYUgFkIHiIUgGnwgC0I/iSALQjiJhSALQgeIhSAGfCAbfCAhQi2JICFCA4mFICFCBoiFfCIifCAVQj+JIBVCOImFIBVCB4iFIBl8ICF8IBRCP4kgFEI4iYUgFEIHiIUgGHwgIHwgE0I/iSATQjiJhSATQgeIhSALfCAffCAeQi2JIB5CA4mFIB5CBoiFfCIjQi2JICNCA4mFICNCBoiFfCIkQi2JICRCA4mFICRCBoiFfCIlQi2JICVCA4mFICVCBoiFfCImfCAdQj+JIB1COImFIB1CB4iFICB8ICV8IBxCP4kgHEI4iYUgHEIHiIUgH3wgJHwgG0I/iSAbQjiJhSAbQgeIhSAWfCAjfCAaQj+JIBpCOImFIBpCB4iFIBV8IB58IBlCP4kgGUI4iYUgGUIHiIUgFHwgHXwgGEI/iSAYQjiJhSAYQgeIhSATfCAcfCAiQi2JICJCA4mFICJCBoiFfCInQi2JICdCA4mFICdCBoiFfCIoQi2JIChCA4mFIChCBoiFfCIpQi2JIClCA4mFIClCBoiFfCIqQi2JICpCA4mFICpCBoiFfCIrQi2JICtCA4mFICtCBoiFfCIsQi2JICxCA4mFICxCBoiFfCItQj+JIC1COImFIC1CB4iFICFCP4kgIUI4iYUgIUIHiIUgHXwgKXwgIEI/iSAgQjiJhSAgQgeIhSAcfCAofCAfQj+JIB9COImFIB9CB4iFIBt8ICd8ICZCLYkgJkIDiYUgJkIGiIV8Ii5CLYkgLkIDiYUgLkIGiIV8Ii9CLYkgL0IDiYUgL0IGiIV8IjB8ICZCP4kgJkI4iYUgJkIHiIUgKXwgIkI/iSAiQjiJhSAiQgeIhSAefCAqfCAwQi2JIDBCA4mFIDBCBoiFfCIxfCAlQj+JICVCOImFICVCB4iFICh8IDB8ICRCP4kgJEI4iYUgJEIHiIUgJ3wgL3wgI0I/iSAjQjiJhSAjQgeIhSAifCAufCAtQi2JIC1CA4mFIC1CBoiFfCIyQi2JIDJCA4mFIDJCBoiFfCIzQi2JIDNCA4mFIDNCBoiFfCI0Qi2JIDRCA4mFIDRCBoiFfCI1fCAsQj+JICxCOImFICxCB4iFIC98IDR8ICtCP4kgK0I4iYUgK0IHiIUgLnwgM3wgKkI/iSAqQjiJhSAqQgeIhSAmfCAyfCApQj+JIClCOImFIClCB4iFICV8IC18IChCP4kgKEI4iYUgKEIHiIUgJHwgLHwgJ0I/iSAnQjiJhSAnQgeIhSAjfCArfCAxQi2JIDFCA4mFIDFCBoiFfCI2Qi2JIDZCA4mFIDZCBoiFfCI3Qi2JIDdCA4mFIDdCBoiFfCI4Qi2JIDhCA4mFIDhCBoiFfCI5Qi2JIDlCA4mFIDlCBoiFfCI6Qi2JIDpCA4mFIDpCBoiFfCI7Qi2JIDtCA4mFIDtCBoiFfCI8Qj+JIDxCOImFIDxCB4iFIDBCP4kgMEI4iYUgMEIHiIUgLHwgOHwgL0I/iSAvQjiJhSAvQgeIhSArfCA3fCAuQj+JIC5COImFIC5CB4iFICp8IDZ8IDVCLYkgNUIDiYUgNUIGiIV8Ij1CLYkgPUIDiYUgPUIGiIV8Ij5CLYkgPkIDiYUgPkIGiIV8Ij98IDVCP4kgNUI4iYUgNUIHiIUgOHwgMUI/iSAxQjiJhSAxQgeIhSAtfCA5fCA/Qi2JID9CA4mFID9CBoiFfCJAfCA0Qj+JIDRCOImFIDRCB4iFIDd8ID98IDNCP4kgM0I4iYUgM0IHiIUgNnwgPnwgMkI/iSAyQjiJhSAyQgeIhSAxfCA9fCA8Qi2JIDxCA4mFIDxCBoiFfCJBQi2JIEFCA4mFIEFCBoiFfCJCQi2JIEJCA4mFIEJCBoiFfCJDQi2JIENCA4mFIENCBoiFfCJEfCA7Qj+JIDtCOImFIDtCB4iFID58IEN8IDpCP4kgOkI4iYUgOkIHiIUgPXwgQnwgOUI/iSA5QjiJhSA5QgeIhSA1fCBBfCA4Qj+JIDhCOImFIDhCB4iFIDR8IDx8IDdCP4kgN0I4iYUgN0IHiIUgM3wgO3wgNkI/iSA2QjiJhSA2QgeIhSAyfCA6fCBAQi2JIEBCA4mFIEBCBoiFfCJFQi2JIEVCA4mFIEVCBoiFfCJGQi2JIEZCA4mFIEZCBoiFfCJHQi2JIEdCA4mFIEdCBoiFfCJIQi2JIEhCA4mFIEhCBoiFfCJJQi2JIElCA4mFIElCBoiFfCJKQi2JIEpCA4mFIEpCBoiFfCJLIEkgRSA/ID0gMiAsICogIiAgIBYgBiAXIAhBACkDqIoBIkxCMokgTEIuiYUgTEIXiYVBACkDwIoBIk18QQApA7iKASJOQQApA7CKASJPhSBMgyBOhXwgA3xCotyiuY3zi8XCAHwiA0EAKQOgigEiUHwiASAPfCBMIBF8IE8gCXwgTiACfCABIE8gTIWDIE+FfCABQjKJIAFCLomFIAFCF4mFfELNy72fkpLRm/EAfCJRQQApA5iKASJSfCIJIAEgTIWDIEyFfCAJQjKJIAlCLomFIAlCF4mFfEKv9rTi/vm+4LV/fCJTQQApA5CKASJUfCIPIAkgAYWDIAGFfCAPQjKJIA9CLomFIA9CF4mFfEK8t6eM2PT22ml8IlVBACkDiIoBIgF8IhEgDyAJhYMgCYV8IBFCMokgEUIuiYUgEUIXiYV8Qrjqopq/y7CrOXwiViBSIFQgAYWDIFQgAYOFIAFCJIkgAUIeiYUgAUIZiYV8IAN8IgJ8IgN8IAwgEXwgDSAPfCAOIAl8IAMgESAPhYMgD4V8IANCMokgA0IuiYUgA0IXiYV8Qpmgl7CbvsT42QB8Ig0gAiABhSBUgyACIAGDhSACQiSJIAJCHomFIAJCGYmFfCBRfCIJfCIIIAMgEYWDIBGFfCAIQjKJIAhCLomFIAhCF4mFfEKbn+X4ytTgn5J/fCIOIAkgAoUgAYMgCSACg4UgCUIkiSAJQh6JhSAJQhmJhXwgU3wiD3wiESAIIAOFgyADhXwgEUIyiSARQi6JhSARQheJhXxCmIK2093al46rf3wiUSAPIAmFIAKDIA8gCYOFIA9CJIkgD0IeiYUgD0IZiYV8IFV8IgJ8IgMgESAIhYMgCIV8IANCMokgA0IuiYUgA0IXiYV8QsKEjJiK0+qDWHwiUyACIA+FIAmDIAIgD4OFIAJCJIkgAkIeiYUgAkIZiYV8IFZ8Igl8Igx8IBIgA3wgCiARfCAEIAh8IAwgAyARhYMgEYV8IAxCMokgDEIuiYUgDEIXiYV8Qr7fwauU4NbBEnwiBCAJIAKFIA+DIAkgAoOFIAlCJIkgCUIeiYUgCUIZiYV8IA18Ig98IhEgDCADhYMgA4V8IBFCMokgEUIuiYUgEUIXiYV8Qozlkvfkt+GYJHwiCiAPIAmFIAKDIA8gCYOFIA9CJIkgD0IeiYUgD0IZiYV8IA58IgJ8IgMgESAMhYMgDIV8IANCMokgA0IuiYUgA0IXiYV8QuLp/q+9uJ+G1QB8IhIgAiAPhSAJgyACIA+DhSACQiSJIAJCHomFIAJCGYmFfCBRfCIJfCIIIAMgEYWDIBGFfCAIQjKJIAhCLomFIAhCF4mFfELvku6Tz66X3/IAfCIXIAkgAoUgD4MgCSACg4UgCUIkiSAJQh6JhSAJQhmJhXwgU3wiD3wiDHwgByAIfCAFIAN8IBAgEXwgDCAIIAOFgyADhXwgDEIyiSAMQi6JhSAMQheJhXxCsa3a2OO/rO+Af3wiAyAPIAmFIAKDIA8gCYOFIA9CJIkgD0IeiYUgD0IZiYV8IAR8IgV8IgIgDCAIhYMgCIV8IAJCMokgAkIuiYUgAkIXiYV8QrWknK7y1IHum398IgggBSAPhSAJgyAFIA+DhSAFQiSJIAVCHomFIAVCGYmFfCAKfCIGfCIJIAIgDIWDIAyFfCAJQjKJIAlCLomFIAlCF4mFfEKUzaT7zK78zUF8IgwgBiAFhSAPgyAGIAWDhSAGQiSJIAZCHomFIAZCGYmFfCASfCIHfCIPIAkgAoWDIAKFfCAPQjKJIA9CLomFIA9CF4mFfELSlcX3mbjazWR8IgQgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAXfCIFfCIRIBR8IBggD3wgEyAJfCALIAJ8IBEgDyAJhYMgCYV8IBFCMokgEUIuiYUgEUIXiYV8QuPLvMLj8JHfb3wiAiAFIAeFIAaDIAUgB4OFIAVCJIkgBUIeiYUgBUIZiYV8IAN8IgZ8IgsgESAPhYMgD4V8IAtCMokgC0IuiYUgC0IXiYV8QrWrs9zouOfgD3wiCSAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IAh8Igd8IhMgCyARhYMgEYV8IBNCMokgE0IuiYUgE0IXiYV8QuW4sr3HuaiGJHwiDyAHIAaFIAWDIAcgBoOFIAdCJIkgB0IeiYUgB0IZiYV8IAx8IgV8IhQgEyALhYMgC4V8IBRCMokgFEIuiYUgFEIXiYV8QvWErMn1jcv0LXwiESAFIAeFIAaDIAUgB4OFIAVCJIkgBUIeiYUgBUIZiYV8IAR8IgZ8Ihh8IBogFHwgFSATfCAZIAt8IBggFCAThYMgE4V8IBhCMokgGEIuiYUgGEIXiYV8QoPJm/WmlaG6ygB8IhYgBiAFhSAHgyAGIAWDhSAGQiSJIAZCHomFIAZCGYmFfCACfCIHfCILIBggFIWDIBSFfCALQjKJIAtCLomFIAtCF4mFfELU94fqy7uq2NwAfCIZIAcgBoUgBYMgByAGg4UgB0IkiSAHQh6JhSAHQhmJhXwgCXwiBXwiEyALIBiFgyAYhXwgE0IyiSATQi6JhSATQheJhXxCtafFmKib4vz2AHwiGCAFIAeFIAaDIAUgB4OFIAVCJIkgBUIeiYUgBUIZiYV8IA98IgZ8IhQgEyALhYMgC4V8IBRCMokgFEIuiYUgFEIXiYV8Qqu/m/OuqpSfmH98IhogBiAFhSAHgyAGIAWDhSAGQiSJIAZCHomFIAZCGYmFfCARfCIHfCIVfCAcIBR8IB8gE3wgGyALfCAVIBQgE4WDIBOFfCAVQjKJIBVCLomFIBVCF4mFfEKQ5NDt0s3xmKh/fCIbIAcgBoUgBYMgByAGg4UgB0IkiSAHQh6JhSAHQhmJhXwgFnwiBXwiCyAVIBSFgyAUhXwgC0IyiSALQi6JhSALQheJhXxCv8Lsx4n5yYGwf3wiFiAFIAeFIAaDIAUgB4OFIAVCJIkgBUIeiYUgBUIZiYV8IBl8IgZ8IhMgCyAVhYMgFYV8IBNCMokgE0IuiYUgE0IXiYV8QuSdvPf7+N+sv398IhkgBiAFhSAHgyAGIAWDhSAGQiSJIAZCHomFIAZCGYmFfCAYfCIHfCIUIBMgC4WDIAuFfCAUQjKJIBRCLomFIBRCF4mFfELCn6Lts/6C8EZ8IhggByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAafCIFfCIVfCAeIBR8ICEgE3wgHSALfCAVIBQgE4WDIBOFfCAVQjKJIBVCLomFIBVCF4mFfEKlzqqY+ajk01V8IhogBSAHhSAGgyAFIAeDhSAFQiSJIAVCHomFIAVCGYmFfCAbfCIGfCILIBUgFIWDIBSFfCALQjKJIAtCLomFIAtCF4mFfELvhI6AnuqY5QZ8IhsgBiAFhSAHgyAGIAWDhSAGQiSJIAZCHomFIAZCGYmFfCAWfCIHfCITIAsgFYWDIBWFfCATQjKJIBNCLomFIBNCF4mFfELw3LnQ8KzKlBR8IhYgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAZfCIFfCIUIBMgC4WDIAuFfCAUQjKJIBRCLomFIBRCF4mFfEL838i21NDC2yd8IhkgBSAHhSAGgyAFIAeDhSAFQiSJIAVCHomFIAVCGYmFfCAYfCIGfCIVICh8ICQgFHwgJyATfCAjIAt8IBUgFCAThYMgE4V8IBVCMokgFUIuiYUgFUIXiYV8QqaSm+GFp8iNLnwiGCAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBp8Igd8IgsgFSAUhYMgFIV8IAtCMokgC0IuiYUgC0IXiYV8Qu3VkNbFv5uWzQB8IhogByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAbfCIFfCITIAsgFYWDIBWFfCATQjKJIBNCLomFIBNCF4mFfELf59bsuaKDnNMAfCIbIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgFnwiBnwiFCATIAuFgyALhXwgFEIyiSAUQi6JhSAUQheJhXxC3se93cjqnIXlAHwiFiAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBl8Igd8IhV8ICYgFHwgKSATfCAlIAt8IBUgFCAThYMgE4V8IBVCMokgFUIuiYUgFUIXiYV8Qqjl3uOz14K19gB8IhkgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAYfCIFfCILIBUgFIWDIBSFfCALQjKJIAtCLomFIAtCF4mFfELm3ba/5KWy4YF/fCIYIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgGnwiBnwiEyALIBWFgyAVhXwgE0IyiSATQi6JhSATQheJhXxCu+qIpNGQi7mSf3wiGiAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBt8Igd8IhQgEyALhYMgC4V8IBRCMokgFEIuiYUgFEIXiYV8QuSGxOeUlPrfon98IhsgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAWfCIFfCIVfCAvIBR8ICsgE3wgLiALfCAVIBQgE4WDIBOFfCAVQjKJIBVCLomFIBVCF4mFfEKB4Ijiu8mZjah/fCIWIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgGXwiBnwiCyAVIBSFgyAUhXwgC0IyiSALQi6JhSALQheJhXxCka/ih43u4qVCfCIZIAYgBYUgB4MgBiAFg4UgBkIkiSAGQh6JhSAGQhmJhXwgGHwiB3wiEyALIBWFgyAVhXwgE0IyiSATQi6JhSATQheJhXxCsPzSsrC0lLZHfCIYIAcgBoUgBYMgByAGg4UgB0IkiSAHQh6JhSAHQhmJhXwgGnwiBXwiFCATIAuFgyALhXwgFEIyiSAUQi6JhSAUQheJhXxCmKS9t52DuslRfCIaIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgG3wiBnwiFXwgMSAUfCAtIBN8IDAgC3wgFSAUIBOFgyAThXwgFUIyiSAVQi6JhSAVQheJhXxCkNKWq8XEwcxWfCIbIAYgBYUgB4MgBiAFg4UgBkIkiSAGQh6JhSAGQhmJhXwgFnwiB3wiCyAVIBSFgyAUhXwgC0IyiSALQi6JhSALQheJhXxCqsDEu9WwjYd0fCIWIAcgBoUgBYMgByAGg4UgB0IkiSAHQh6JhSAHQhmJhXwgGXwiBXwiEyALIBWFgyAVhXwgE0IyiSATQi6JhSATQheJhXxCuKPvlYOOqLUQfCIZIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgGHwiBnwiFCATIAuFgyALhXwgFEIyiSAUQi6JhSAUQheJhXxCyKHLxuuisNIZfCIYIAYgBYUgB4MgBiAFg4UgBkIkiSAGQh6JhSAGQhmJhXwgGnwiB3wiFSA0fCA3IBR8IDMgE3wgNiALfCAVIBQgE4WDIBOFfCAVQjKJIBVCLomFIBVCF4mFfELT1oaKhYHbmx58IhogByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAbfCIFfCILIBUgFIWDIBSFfCALQjKJIAtCLomFIAtCF4mFfEKZ17v8zemdpCd8IhsgBSAHhSAGgyAFIAeDhSAFQiSJIAVCHomFIAVCGYmFfCAWfCIGfCITIAsgFYWDIBWFfCATQjKJIBNCLomFIBNCF4mFfEKoke2M3pav2DR8IhYgBiAFhSAHgyAGIAWDhSAGQiSJIAZCHomFIAZCGYmFfCAZfCIHfCIUIBMgC4WDIAuFfCAUQjKJIBRCLomFIBRCF4mFfELjtKWuvJaDjjl8IhkgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAYfCIFfCIVfCA5IBR8IDUgE3wgOCALfCAVIBQgE4WDIBOFfCAVQjKJIBVCLomFIBVCF4mFfELLlYaarsmq7M4AfCIYIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgGnwiBnwiCyAVIBSFgyAUhXwgC0IyiSALQi6JhSALQheJhXxC88aPu/fJss7bAHwiGiAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBt8Igd8IhMgCyAVhYMgFYV8IBNCMokgE0IuiYUgE0IXiYV8QqPxyrW9/puX6AB8IhsgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAWfCIFfCIUIBMgC4WDIAuFfCAUQjKJIBRCLomFIBRCF4mFfEL85b7v5d3gx/QAfCIWIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgGXwiBnwiFXwgOyAUfCA+IBN8IDogC3wgFSAUIBOFgyAThXwgFUIyiSAVQi6JhSAVQheJhXxC4N7cmPTt2NL4AHwiGSAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBh8Igd8IgsgFSAUhYMgFIV8IAtCMokgC0IuiYUgC0IXiYV8QvLWwo/Kgp7khH98IhggByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAafCIFfCITIAsgFYWDIBWFfCATQjKJIBNCLomFIBNCF4mFfELs85DTgcHA44x/fCIaIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgG3wiBnwiFCATIAuFgyALhXwgFEIyiSAUQi6JhSAUQheJhXxCqLyMm6L/v9+Qf3wiGyAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBZ8Igd8IhV8IEEgFHwgQCATfCA8IAt8IBUgFCAThYMgE4V8IBVCMokgFUIuiYUgFUIXiYV8Qun7ivS9nZuopH98IhYgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAZfCIFfCILIBUgFIWDIBSFfCALQjKJIAtCLomFIAtCF4mFfEKV8pmW+/7o/L5/fCIZIAUgB4UgBoMgBSAHg4UgBUIkiSAFQh6JhSAFQhmJhXwgGHwiBnwiEyALIBWFgyAVhXwgE0IyiSATQi6JhSATQheJhXxCq6bJm66e3rhGfCIYIAYgBYUgB4MgBiAFg4UgBkIkiSAGQh6JhSAGQhmJhXwgGnwiB3wiFCATIAuFgyALhXwgFEIyiSAUQi6JhSAUQheJhXxCnMOZ0e7Zz5NKfCIaIAcgBoUgBYMgByAGg4UgB0IkiSAHQh6JhSAHQhmJhXwgG3wiBXwiFSBHfCBDIBR8IEYgE3wgQiALfCAVIBQgE4WDIBOFfCAVQjKJIBVCLomFIBVCF4mFfEKHhIOO8piuw1F8IhsgBSAHhSAGgyAFIAeDhSAFQiSJIAVCHomFIAVCGYmFfCAWfCIGfCILIBUgFIWDIBSFfCALQjKJIAtCLomFIAtCF4mFfEKe1oPv7Lqf7Wp8IhYgBiAFhSAHgyAGIAWDhSAGQiSJIAZCHomFIAZCGYmFfCAZfCIHfCITIAsgFYWDIBWFfCATQjKJIBNCLomFIBNCF4mFfEL4orvz/u/TvnV8IhkgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAYfCIFfCIUIBMgC4WDIAuFfCAUQjKJIBRCLomFIBRCF4mFfEK6392Qp/WZ+AZ8IhwgBSAHhSAGgyAFIAeDhSAFQiSJIAVCHomFIAVCGYmFfCAafCIGfCIVfCA9Qj+JID1COImFID1CB4iFIDl8IEV8IERCLYkgREIDiYUgREIGiIV8IhggFHwgSCATfCBEIAt8IBUgFCAThYMgE4V8IBVCMokgFUIuiYUgFUIXiYV8QqaxopbauN+xCnwiGiAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBt8Igd8IgsgFSAUhYMgFIV8IAtCMokgC0IuiYUgC0IXiYV8Qq6b5PfLgOafEXwiGyAHIAaFIAWDIAcgBoOFIAdCJIkgB0IeiYUgB0IZiYV8IBZ8IgV8IhMgCyAVhYMgFYV8IBNCMokgE0IuiYUgE0IXiYV8QpuO8ZjR5sK4G3wiHSAFIAeFIAaDIAUgB4OFIAVCJIkgBUIeiYUgBUIZiYV8IBl8IgZ8IhQgEyALhYMgC4V8IBRCMokgFEIuiYUgFEIXiYV8QoT7kZjS/t3tKHwiHiAGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBx8Igd8IhV8ID9CP4kgP0I4iYUgP0IHiIUgO3wgR3wgPkI/iSA+QjiJhSA+QgeIhSA6fCBGfCAYQi2JIBhCA4mFIBhCBoiFfCIWQi2JIBZCA4mFIBZCBoiFfCIZIBR8IEogE3wgFiALfCAVIBQgE4WDIBOFfCAVQjKJIBVCLomFIBVCF4mFfEKTyZyGtO+q5TJ8IgsgByAGhSAFgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCAafCIFfCITIBUgFIWDIBSFfCATQjKJIBNCLomFIBNCF4mFfEK8/aauocGvzzx8IhogBSAHhSAGgyAFIAeDhSAFQiSJIAVCHomFIAVCGYmFfCAbfCIGfCIUIBMgFYWDIBWFfCAUQjKJIBRCLomFIBRCF4mFfELMmsDgyfjZjsMAfCIbIAYgBYUgB4MgBiAFg4UgBkIkiSAGQh6JhSAGQhmJhXwgHXwiB3wiFSAUIBOFgyAThXwgFUIyiSAVQi6JhSAVQheJhXxCtoX52eyX9eLMAHwiHCAHIAaFIAWDIAcgBoOFIAdCJIkgB0IeiYUgB0IZiYV8IB58IgV8IhYgTXw3A8CKAUEAIFAgBSAHhSAGgyAFIAeDhSAFQiSJIAVCHomFIAVCGYmFfCALfCIGIAWFIAeDIAYgBYOFIAZCJIkgBkIeiYUgBkIZiYV8IBp8IgcgBoUgBYMgByAGg4UgB0IkiSAHQh6JhSAHQhmJhXwgG3wiBSAHhSAGgyAFIAeDhSAFQiSJIAVCHomFIAVCGYmFfCAcfCILfDcDoIoBQQAgTiBAQj+JIEBCOImFIEBCB4iFIDx8IEh8IBlCLYkgGUIDiYUgGUIGiIV8IhkgE3wgFiAVIBSFgyAUhXwgFkIyiSAWQi6JhSAWQheJhXxCqvyV48+zyr/ZAHwiGiAGfCITfDcDuIoBQQAgUiALIAWFIAeDIAsgBYOFIAtCJIkgC0IeiYUgC0IZiYV8IBp8IgZ8NwOYigFBACBPIEFCP4kgQUI4iYUgQUIHiIUgQHwgGHwgS0ItiSBLQgOJhSBLQgaIhXwgFHwgEyAWIBWFgyAVhXwgE0IyiSATQi6JhSATQheJhXxC7PXb1rP12+XfAHwiGCAHfCIUfDcDsIoBQQAgVCAGIAuFIAWDIAYgC4OFIAZCJIkgBkIeiYUgBkIZiYV8IBh8Igd8NwOQigFBACBMIEVCP4kgRUI4iYUgRUIHiIUgQXwgSXwgGUItiSAZQgOJhSAZQgaIhXwgFXwgFCATIBaFgyAWhXwgFEIyiSAUQi6JhSAUQheJhXxCl7Cd0sSxhqLsAHwiEyAFfHw3A6iKAUEAIAEgByAGhSALgyAHIAaDhSAHQiSJIAdCHomFIAdCGYmFfCATfHw3A4iKAQvzCQIBfgR/QQApA4CKASIAp0EDdkEPcSIBQQN0QYCJAWoiAiACKQMAQn8gAEIDhiIAhkJ/hYNCgAEgAIaFNwMAIAFBAWohAwJAIAFBDkkNAAJAIANBD0cNAEEAQgA3A/iJAQtBgIkBEANBACEDCyADIQQCQEEHIANrQQdxIgJFDQAgAyACaiEEIANBA3RBgIkBaiEBA0AgAUIANwMAIAFBCGohASACQX9qIgINAAsLAkAgA0F4akEHSQ0AIARBA3QhAQNAIAFBuIkBakIANwMAIAFBsIkBakIANwMAIAFBqIkBakIANwMAIAFBoIkBakIANwMAIAFBmIkBakIANwMAIAFBkIkBakIANwMAIAFBiIkBakIANwMAIAFBgIkBakIANwMAIAFBwABqIgFB+ABHDQALC0EAIQFBAEEAKQOAigEiAEI7hiAAQiuGQoCAgICAgMD/AIOEIABCG4ZCgICAgIDgP4MgAEILhkKAgICA8B+DhIQgAEIFiEKAgID4D4MgAEIViEKAgPwHg4QgAEIliEKA/gODIABCA4ZCOIiEhIQ3A/iJAUGAiQEQA0EAQQApA8CKASIAQjiGIABCgP4Dg0IohoQgAEKAgPwHg0IYhiAAQoCAgPgPg0IIhoSEIABCCIhCgICA+A+DIABCGIhCgID8B4OEIABCKIhCgP4DgyAAQjiIhISENwPAigFBAEEAKQO4igEiAEI4hiAAQoD+A4NCKIaEIABCgID8B4NCGIYgAEKAgID4D4NCCIaEhCAAQgiIQoCAgPgPgyAAQhiIQoCA/AeDhCAAQiiIQoD+A4MgAEI4iISEhDcDuIoBQQBBACkDsIoBIgBCOIYgAEKA/gODQiiGhCAAQoCA/AeDQhiGIABCgICA+A+DQgiGhIQgAEIIiEKAgID4D4MgAEIYiEKAgPwHg4QgAEIoiEKA/gODIABCOIiEhIQ3A7CKAUEAQQApA6iKASIAQjiGIABCgP4Dg0IohoQgAEKAgPwHg0IYhiAAQoCAgPgPg0IIhoSEIABCCIhCgICA+A+DIABCGIhCgID8B4OEIABCKIhCgP4DgyAAQjiIhISENwOoigFBAEEAKQOgigEiAEI4hiAAQoD+A4NCKIaEIABCgID8B4NCGIYgAEKAgID4D4NCCIaEhCAAQgiIQoCAgPgPgyAAQhiIQoCA/AeDhCAAQiiIQoD+A4MgAEI4iISEhDcDoIoBQQBBACkDmIoBIgBCOIYgAEKA/gODQiiGhCAAQoCA/AeDQhiGIABCgICA+A+DQgiGhIQgAEIIiEKAgID4D4MgAEIYiEKAgPwHg4QgAEIoiEKA/gODIABCOIiEhIQ3A5iKAUEAQQApA5CKASIAQjiGIABCgP4Dg0IohoQgAEKAgPwHg0IYhiAAQoCAgPgPg0IIhoSEIABCCIhCgICA+A+DIABCGIhCgID8B4OEIABCKIhCgP4DgyAAQjiIhISENwOQigFBAEEAKQOIigEiAEI4hiAAQoD+A4NCKIaEIABCgID8B4NCGIYgAEKAgID4D4NCCIaEhCAAQgiIQoCAgPgPgyAAQhiIQoCA/AeDhCAAQiiIQoD+A4MgAEI4iISEhDcDiIoBAkBBACgCyIoBIgNFDQBBACECA0AgAUGACWogAUGIigFqLQAAOgAAIAFBAWohASADIAJBAWoiAkH/AXFLDQALCwsGAEGAiQELoQIAQQBCADcDgIoBQQBBMEHAACABQYADRiIBGzYCyIoBQQBCpJ/p99uD0trHAEL5wvibkaOz8NsAIAEbNwPAigFBAEKnn+an1sGLhltC6/qG2r+19sEfIAEbNwO4igFBAEKRquDC9tCS2o5/Qp/Y+dnCkdqCm38gARs3A7CKAUEAQrGWgP7/zMmZ5wBC0YWa7/rPlIfRACABGzcDqIoBQQBCubK5uI+b+5cVQvHt9Pilp/2npX8gARs3A6CKAUEAQpe6w4Ojq8CskX9Cq/DT9K/uvLc8IAEbNwOYigFBAEKHqvOzo6WKzeIAQrvOqqbY0Ouzu38gARs3A5CKAUEAQti9lojcq+fdS0KIkvOd/8z5hOoAIAEbNwOIigEgABACEAQLCwsBAEGACAsE0AAAAA==";
      var hash$9 = "f2e40eb1";
      var wasmJson$9 = {
        name: name$9,
        data: data$9,
        hash: hash$9
      };
      const mutex$8 = new Mutex();
      let wasmCache$8 = null;
      function sha384(data2) {
        if (wasmCache$8 === null) {
          return lockedCreate(mutex$8, wasmJson$9, 48).then((wasm) => {
            wasmCache$8 = wasm;
            return wasmCache$8.calculate(data2, 384);
          });
        }
        try {
          const hash2 = wasmCache$8.calculate(data2, 384);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createSHA384() {
        return WASMInterface(wasmJson$9, 48).then((wasm) => {
          wasm.init(384);
          const obj = {
            init: () => {
              wasm.init(384);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 128,
            digestSize: 48
          };
          return obj;
        });
      }
      const mutex$7 = new Mutex();
      let wasmCache$7 = null;
      function sha512(data2) {
        if (wasmCache$7 === null) {
          return lockedCreate(mutex$7, wasmJson$9, 64).then((wasm) => {
            wasmCache$7 = wasm;
            return wasmCache$7.calculate(data2, 512);
          });
        }
        try {
          const hash2 = wasmCache$7.calculate(data2, 512);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createSHA512() {
        return WASMInterface(wasmJson$9, 64).then((wasm) => {
          wasm.init(512);
          const obj = {
            init: () => {
              wasm.init(512);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 128,
            digestSize: 64
          };
          return obj;
        });
      }
      var name$8 = "xxhash32";
      var data$8 = "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";
      var hash$8 = "4bb12485";
      var wasmJson$8 = {
        name: name$8,
        data: data$8,
        hash: hash$8
      };
      const mutex$6 = new Mutex();
      let wasmCache$6 = null;
      function validateSeed$3(seed) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
          return new Error("Seed must be a valid 32-bit long unsigned integer.");
        }
        return null;
      }
      function xxhash32(data2, seed = 0) {
        if (validateSeed$3(seed)) {
          return Promise.reject(validateSeed$3(seed));
        }
        if (wasmCache$6 === null) {
          return lockedCreate(mutex$6, wasmJson$8, 4).then((wasm) => {
            wasmCache$6 = wasm;
            return wasmCache$6.calculate(data2, seed);
          });
        }
        try {
          const hash2 = wasmCache$6.calculate(data2, seed);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createXXHash32(seed = 0) {
        if (validateSeed$3(seed)) {
          return Promise.reject(validateSeed$3(seed));
        }
        return WASMInterface(wasmJson$8, 4).then((wasm) => {
          wasm.init(seed);
          const obj = {
            init: () => {
              wasm.init(seed);
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 16,
            digestSize: 4
          };
          return obj;
        });
      }
      var name$7 = "xxhash64";
      var data$7 = "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";
      var hash$7 = "177fbfa3";
      var wasmJson$7 = {
        name: name$7,
        data: data$7,
        hash: hash$7
      };
      const mutex$5 = new Mutex();
      let wasmCache$5 = null;
      const seedBuffer$2 = new Uint8Array(8);
      function validateSeed$2(seed) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
          return new Error("Seed must be given as two valid 32-bit long unsigned integers (lo + high).");
        }
        return null;
      }
      function writeSeed$2(arr, low, high) {
        const buffer = new DataView(arr);
        buffer.setUint32(0, low, true);
        buffer.setUint32(4, high, true);
      }
      function xxhash64(data2, seedLow = 0, seedHigh = 0) {
        if (validateSeed$2(seedLow)) {
          return Promise.reject(validateSeed$2(seedLow));
        }
        if (validateSeed$2(seedHigh)) {
          return Promise.reject(validateSeed$2(seedHigh));
        }
        if (wasmCache$5 === null) {
          return lockedCreate(mutex$5, wasmJson$7, 8).then((wasm) => {
            wasmCache$5 = wasm;
            writeSeed$2(seedBuffer$2.buffer, seedLow, seedHigh);
            wasmCache$5.writeMemory(seedBuffer$2);
            return wasmCache$5.calculate(data2);
          });
        }
        try {
          writeSeed$2(seedBuffer$2.buffer, seedLow, seedHigh);
          wasmCache$5.writeMemory(seedBuffer$2);
          const hash2 = wasmCache$5.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createXXHash64(seedLow = 0, seedHigh = 0) {
        if (validateSeed$2(seedLow)) {
          return Promise.reject(validateSeed$2(seedLow));
        }
        if (validateSeed$2(seedHigh)) {
          return Promise.reject(validateSeed$2(seedHigh));
        }
        return WASMInterface(wasmJson$7, 8).then((wasm) => {
          const instanceBuffer = new Uint8Array(8);
          writeSeed$2(instanceBuffer.buffer, seedLow, seedHigh);
          wasm.writeMemory(instanceBuffer);
          wasm.init();
          const obj = {
            init: () => {
              wasm.writeMemory(instanceBuffer);
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 32,
            digestSize: 8
          };
          return obj;
        });
      }
      var name$6 = "xxhash3";
      var data$6 = "AGFzbQEAAAABNAhgAAF/YAR/f39/AGAHf39/f39/fwBgBH9+fn4BfmAEf39/fgF+YAN/f34BfmAAAGABfwADDg0AAQIDBAUFBQYHBgAGBQQBAQICBg4CfwFBwI4FC38AQcAJCwdwCAZtZW1vcnkCAA5IYXNoX0dldEJ1ZmZlcgAACUhhc2hfSW5pdAAIC0hhc2hfVXBkYXRlAAkKSGFzaF9GaW5hbAAKDUhhc2hfR2V0U3RhdGUACw5IYXNoX0NhbGN1bGF0ZQAMClNUQVRFX1NJWkUDAQr6QQ0FAEGACgvkAwMPfgF/AX4CQCADRQ0AIAApAzAhBCAAKQM4IQUgACkDICEGIAApAyghByAAKQMQIQggACkDGCEJIAApAwAhCiAAKQMIIQsDQCAFIAFBMGopAwAiDHwgAkE4aikDACABQThqKQMAIg2FIgVCIIggBUL/////D4N+fCEFIAcgAUEgaikDACIOfCACQShqKQMAIAFBKGopAwAiD4UiB0IgiCAHQv////8Pg358IQcgCSABQRBqKQMAIhB8IAJBGGopAwAgAUEYaikDACIRhSIJQiCIIAlC/////w+DfnwhCSALIAEpAwAiEnwgAkEIaiITKQMAIAFBCGopAwAiFIUiC0IgiCALQv////8Pg358IQsgAkEwaikDACAMhSIMQiCIIAxC/////w+DfiAEfCANfCEEIAJBIGopAwAgDoUiDEIgiCAMQv////8Pg34gBnwgD3whBiACQRBqKQMAIBCFIgxCIIggDEL/////D4N+IAh8IBF8IQggAikDACAShSIMQiCIIAxC/////w+DfiAKfCAUfCEKIAFBwABqIQEgEyECIANBf2oiAw0ACyAAIAk3AxggACAKNwMAIAAgCzcDCCAAIAc3AyggACAINwMQIAAgBTcDOCAAIAY3AyAgACAENwMwCwveAgIBfwF+AkAgBCACIAEoAgAiB2siAkkNACAAIAMgBSAHQQN0aiACEAEgACAFIAZqIgcpAwAgACkDACIIQi+IhSAIhUKx893xCX43AwAgACAHKQMIIAApAwgiCEIviIUgCIVCsfPd8Ql+NwMIIAAgBykDECAAKQMQIghCL4iFIAiFQrHz3fEJfjcDECAAIAcpAxggACkDGCIIQi+IhSAIhUKx893xCX43AxggACAHKQMgIAApAyAiCEIviIUgCIVCsfPd8Ql+NwMgIAAgBykDKCAAKQMoIghCL4iFIAiFQrHz3fEJfjcDKCAAIAcpAzAgACkDMCIIQi+IhSAIhUKx893xCX43AzAgACAHKQM4IAApAzgiCEIviIUgCIVCsfPd8Ql+NwM4IAAgAyACQQZ0aiAFIAQgAmsiBxABIAEgBzYCAA8LIAAgAyAFIAdBA3RqIAQQASABIAcgBGo2AgALhQEBAX8gAiABhSADpyIEQRh0IARBgP4DcUEIdHIgBEEIdkGA/gNxIARBGHZycq1CIIYgA4V9QQA1AoCMAUIghiAAQfyLAWo1AgCEhSIDQjGJIANCGImFIAOFQqW+4/TRjIfZn39+IgNCI4ggAK18IAOFQqW+4/TRjIfZn39+IgNCHIggA4ULZwAgAiABc60gA3wiA0IhiEEALQCAjAFBEHQgAEEIdHIgAEEBdkGAjAFqLQAAQRh0ciAAQf+LAWotAAByrYUgA4VCz9bTvtLHq9lCfiIDQh2IIAOFQvnz3fGZ9pmrFn4iA0IgiCADhQuJAwEEfgJAIABBCUkNAEEAKQOAjAEgASkDICABKQMYhSACfIUiA0I4hiADQoD+A4NCKIaEIANCgID8B4NCGIYgA0KAgID4D4NCCIaEhCADQgiIQoCAgPgPgyADQhiIQoCA/AeDhCADQiiIQoD+A4MgA0I4iISEhCAArXwgAEH4iwFqKQMAIAEpAzAgASkDKIUgAn2FIgJ8IAJC/////w+DIgQgA0IgiCIFfiIGQv////8PgyACQiCIIgIgA0L/////D4MiA358IAQgA34iA0IgiHwiBEIghiADQv////8Pg4QgBkIgiCACIAV+fCAEQiCIfIV8IgNCJYggA4VC+fPd8ZnymasWfiIDQiCIIAOFDwsCQCAAQQRJDQAgACABQQhqKQMAIAFBEGopAwAgAhADDwsCQCAARQ0AIAAgASgCACABQQRqKAIAIAIQBA8LIAEpAzggASkDQIUgAoUiA0IhiCADhULP1tO+0ser2UJ+IgNCHYggA4VC+fPd8Zn2masWfiIDQiCIIAOFC94IAQZ+IACtQoeVr6+Ytt6bnn9+IQMCQCAAQSFJDQACQCAAQcEASQ0AAkAgAEHhAEkNACABKQNoIAJ9QQApA7iMAYUiBEL/////D4MiBSABKQNgIAJ8QQApA7CMAYUiBkIgiCIHfiIIQv////8PgyAEQiCIIgQgBkL/////D4MiBn58IAUgBn4iBUIgiHwiBkIghiAFQv////8Pg4QgCEIgiCAEIAd+fCAGQiCIfIUgA3wgASkDeCACfSAAQciLAWopAwCFIgNC/////w+DIgQgASkDcCACfCAAQcCLAWopAwCFIgVCIIgiBn4iB0L/////D4MgA0IgiCIDIAVC/////w+DIgV+fCAEIAV+IgRCIIh8IgVCIIYgBEL/////D4OEIAdCIIggAyAGfnwgBUIgiHyFfCEDCyABKQNIIAJ9QQApA6iMAYUiBEL/////D4MiBSABKQNAIAJ8QQApA6CMAYUiBkIgiCIHfiIIQv////8PgyAEQiCIIgQgBkL/////D4MiBn58IAUgBn4iBUIgiHwiBkIghiAFQv////8Pg4QgCEIgiCAEIAd+fCAGQiCIfIUgA3wgASkDWCACfSAAQdiLAWopAwCFIgNC/////w+DIgQgASkDUCACfCAAQdCLAWopAwCFIgVCIIgiBn4iB0L/////D4MgA0IgiCIDIAVC/////w+DIgV+fCAEIAV+IgRCIIh8IgVCIIYgBEL/////D4OEIAdCIIggAyAGfnwgBUIgiHyFfCEDCyABKQMoIAJ9QQApA5iMAYUiBEL/////D4MiBSABKQMgIAJ8QQApA5CMAYUiBkIgiCIHfiIIQv////8PgyAEQiCIIgQgBkL/////D4MiBn58IAUgBn4iBUIgiHwiBkIghiAFQv////8Pg4QgCEIgiCAEIAd+fCAGQiCIfIUgA3wgASkDOCACfSAAQeiLAWopAwCFIgNC/////w+DIgQgASkDMCACfCAAQeCLAWopAwCFIgVCIIgiBn4iB0L/////D4MgA0IgiCIDIAVC/////w+DIgV+fCAEIAV+IgRCIIh8IgVCIIYgBEL/////D4OEIAdCIIggAyAGfnwgBUIgiHyFfCEDCyABKQMIIAJ9QQApA4iMAYUiBEL/////D4MiBSABKQMAIAJ8QQApA4CMAYUiBkIgiCIHfiIIQv////8PgyAEQiCIIgQgBkL/////D4MiBn58IAUgBn4iBUIgiHwiBkIghiAFQv////8Pg4QgCEIgiCAEIAd+fCAGQiCIfIUgA3wgASkDGCACfSAAQfiLAWopAwCFIgNC/////w+DIgQgASkDECACfCAAQfCLAWopAwCFIgJCIIgiBX4iBkL/////D4MgA0IgiCIDIAJC/////w+DIgJ+fCAEIAJ+IgJCIIh8IgRCIIYgAkL/////D4OEIAZCIIggAyAFfnwgBEIgiHyFfCICQiWIIAKFQvnz3fGZ8pmrFn4iAkIgiCAChQv8CgQBfwV+An8BfkEAIQMgASkDeCACfUEAKQP4jAGFIgRC/////w+DIgUgASkDcCACfEEAKQPwjAGFIgZCIIgiB34iCEL/////D4MgBEIgiCIEIAZC/////w+DIgZ+fCAFIAZ+IgVCIIh8IgZCIIYgBUL/////D4OEIAhCIIggBCAHfnwgBkIgiHyFIAEpA2ggAn1BACkD6IwBhSIEQv////8PgyIFIAEpA2AgAnxBACkD4IwBhSIGQiCIIgd+IghC/////w+DIARCIIgiBCAGQv////8PgyIGfnwgBSAGfiIFQiCIfCIGQiCGIAVC/////w+DhCAIQiCIIAQgB358IAZCIIh8hSABKQNYIAJ9QQApA9iMAYUiBEL/////D4MiBSABKQNQIAJ8QQApA9CMAYUiBkIgiCIHfiIIQv////8PgyAEQiCIIgQgBkL/////D4MiBn58IAUgBn4iBUIgiHwiBkIghiAFQv////8Pg4QgCEIgiCAEIAd+fCAGQiCIfIUgASkDSCACfUEAKQPIjAGFIgRC/////w+DIgUgASkDQCACfEEAKQPAjAGFIgZCIIgiB34iCEL/////D4MgBEIgiCIEIAZC/////w+DIgZ+fCAFIAZ+IgVCIIh8IgZCIIYgBUL/////D4OEIAhCIIggBCAHfnwgBkIgiHyFIAEpAzggAn1BACkDuIwBhSIEQv////8PgyIFIAEpAzAgAnxBACkDsIwBhSIGQiCIIgd+IghC/////w+DIARCIIgiBCAGQv////8PgyIGfnwgBSAGfiIFQiCIfCIGQiCGIAVC/////w+DhCAIQiCIIAQgB358IAZCIIh8hSABKQMoIAJ9QQApA6iMAYUiBEL/////D4MiBSABKQMgIAJ8QQApA6CMAYUiBkIgiCIHfiIIQv////8PgyAEQiCIIgQgBkL/////D4MiBn58IAUgBn4iBUIgiHwiBkIghiAFQv////8Pg4QgCEIgiCAEIAd+fCAGQiCIfIUgASkDGCACfUEAKQOYjAGFIgRC/////w+DIgUgASkDECACfEEAKQOQjAGFIgZCIIgiB34iCEL/////D4MgBEIgiCIEIAZC/////w+DIgZ+fCAFIAZ+IgVCIIh8IgZCIIYgBUL/////D4OEIAhCIIggBCAHfnwgBkIgiHyFIAEpAwggAn1BACkDiIwBhSIEQv////8PgyIFIAEpAwAgAnxBACkDgIwBhSIGQiCIIgd+IghC/////w+DIARCIIgiBCAGQv////8PgyIGfnwgBSAGfiIFQiCIfCIGQiCGIAVC/////w+DhCAIQiCIIAQgB358IAZCIIh8hSAArUKHla+vmLbem55/fnx8fHx8fHx8IgRCJYggBIVC+fPd8ZnymasWfiIEQiCIIASFIQQCQCAAQZABSA0AIABBBHZBeGohCQNAIAEgA2oiCkELaikDACACfSADQYiNAWopAwCFIgVC/////w+DIgYgCkEDaikDACACfCADQYCNAWopAwCFIgdCIIgiCH4iC0L/////D4MgBUIgiCIFIAdC/////w+DIgd+fCAGIAd+IgZCIIh8IgdCIIYgBkL/////D4OEIAtCIIggBSAIfnwgB0IgiHyFIAR8IQQgA0EQaiEDIAlBf2oiCQ0ACwsgASkDfyACfSAAQfiLAWopAwCFIgVC/////w+DIgYgASkDdyACfCAAQfCLAWopAwCFIgJCIIgiB34iCEL/////D4MgBUIgiCIFIAJC/////w+DIgJ+fCAGIAJ+IgJCIIh8IgZCIIYgAkL/////D4OEIAhCIIggBSAHfnwgBkIgiHyFIAR8IgJCJYggAoVC+fPd8ZnymasWfiICQiCIIAKFC98FAgF+AX8CQAJAQQApA4AKIgBQRQ0AQYAIIQFCACEADAELAkBBACkDoI4BIABSDQBBACEBDAELQQAhAUEAQq+v79e895Kg/gAgAH03A/iLAUEAIABCxZbr+djShYIofDcD8IsBQQBCj/Hjja2P9JhOIAB9NwPoiwFBACAAQqus+MXV79HQfHw3A+CLAUEAQtOt1LKShbW0nn8gAH03A9iLAUEAIABCl5r0jvWWvO3JAHw3A9CLAUEAQsWDgv2v/8SxayAAfTcDyIsBQQAgAELqi7OdyOb09UN8NwPAiwFBAELIv/rLnJveueQAIAB9NwO4iwFBACAAQoqjgd/Ume2sMXw3A7CLAUEAQvm57738+MKnHSAA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QQApA4CKATcDACACQQApA4iKATcDCCACQQApA5CKATcDECACQQApA5iKATcDGCACQQApA6CKATcDICACQQApA6iKATcDKCACQQApA7CKASIFNwMwIAJBACkDuIoBIgY3AzgCQAJAQQAoAoCOASIHQcAASQ0AIAJBACgCiI4BNgJAIAIgAkHAAGpBACgCmI4BQYCMASAHQX9qQQZ2IANBACgCnI4BIgAQAiADIABqIgBBeWopAwAhCCAAKQMJIQkgACkDGSEKIAApAykhCyAHQcCLAWopAwAhBSAAKQMBIQwgB0HIiwFqKQMAIQYgB0HQiwFqKQMAIQ0gACkDESEOIAdB2IsBaikDACEPIAdB4IsBaikDACEQIAApAyEhESAHQeiLAWopAwAhEiACKQMAIRMgAikDECEUIAIpAyAhFSACKQMwIRYgAikDCCEXIAIpAxghGCACKQMoIRkgAiACKQM4IAdB8IsBaikDACIafCAAKQMxIAdB+IsBaikDACIbhSIcQiCIIBxC/////w+Dfnw3AzggGSAQfCARIBKFIhFCIIggEUL/////D4N+fCERIBggDXwgDiAPhSIOQiCIIA5C/////w+DfnwhDiAXIAV8IAwgBoUiDEIgiCAMQv////8Pg358IQwgGyAWIAsgGoUiC0IgiCALQv////8Pg358fCELIBIgFSAKIBCFIhBCIIggEEL/////D4N+fHwhECAPIBQgCSANhSINQiCIIA1C/////w+Dfnx8IRIgBiATIAggBYUiBUIgiCAFQv////8Pg358fCEIDAELIAdBwI0BaiEdQcAAIAdrIR4gAkHAAGohAAJAAkACQCAHQThNDQAgHiEfDAELAkACQEE4IAdrQQN2QQFqQQdxIh8NACACQcAAaiEAIB4hHwwBCyACQcAAaiEAIB9BA3QiICEfA0AgACAdKQMANwMAIABBCGohACAdQQhqIR0gH0F4aiIfDQALQcAAIAcgIGprIR8LAkAgBw0AA0AgACAdKQMANwMAIABBCGogHUEIaikDADcDACAAQRBqIB1BEGopAwA3AwAgAEEYaiAdQRhqKQMANwMAIABBIGogHUEgaikDADcDACAAQShqIB1BKGopAwA3AwAgAEEwaiAdQTBqKQMANwMAIABBOGogHUE4aikDADcDACAAQcAAaiEAIB1BwABqIR0gH0FAaiIfQQdLDQALCyAfRQ0BCyAfQX9qISECQCAfQQdxIiBFDQAgH0F4cSEfA0AgACAdLQAAOgAAIABBAWohACAdQQFqIR0gIEF/aiIgDQALCyAhQQdJDQADQCAAIB0pAAA3AAAgAEEIaiEAIB1BCGohHSAfQXhqIh8NAAsLIAJBwABqIB5qIR1BgIwBIQACQAJAAkAgB0EISQ0AAkAgB0E4akEDdkEBakEHcSIfDQAMAgsgH0EDdCEgQYCMASEAA0AgHSAAKQMANwMAIB1BCGohHSAAQQhqIQAgH0F/aiIfDQALIAcgIGshBwsgB0UNAQJAAkAgB0EHcSIgDQAgByEfDAELIAdBeHEhHwNAIB0gAC0AADoAACAdQQFqIR0gAEEBaiEAICBBf2oiIA0ACwsgB0EISQ0BCwNAIB0gACkAADcAACAdQQhqIR0gAEEIaiEAIB9BeGoiHw0ACwsgA0EAKAKcjgFqIgBBeWopAwAhCiAAKQMJIRMgACkDGSEUIAApAykhCyAAKQMBIQwgACkDESEOIAApAyEhESACKQMAIRUgAikDECEWIAIpAyAhFyACKQMIIRggAikDQCENIAIpA0ghDyACKQMYIRkgAikDUCESIAIpA1ghCCACKQMoIRogAikDYCEQIAIpA2ghCSACIAYgAikDcCIbfCAAKQMxIAIpA3giBoUiHEIgiCAcQv////8Pg358NwM4IBogEHwgESAJhSIRQiCIIBFC/////w+DfnwhESAZIBJ8IA4gCIUiDkIgiCAOQv////8Pg358IQ4gGCANfCAMIA+FIgxCIIggDEL/////D4N+fCEMIAYgCyAbhSILQiCIIAtC/////w+DfiAFfHwhCyAJIBcgFCAQhSIFQiCIIAVC/////w+Dfnx8IRAgCCAWIBMgEoUiBUIgiCAFQv////8Pg358fCESIA8gFSAKIA2FIgVCIIggBUL/////D4N+fHwhCAsgAykDQyACKQM4hSIFQv////8PgyIGIAMpAzsgC4UiC0IgiCINfiIPQv////8PgyAFQiCIIgUgC0L/////D4MiC358IAYgC34iBkIgiHwiC0IghiAGQv////8Pg4QgD0IgiCAFIA1+fCALQiCIfIUgAykDMyARhSIFQv////8PgyIGIAMpAysgEIUiC0IgiCINfiIPQv////8PgyAFQiCIIgUgC0L/////D4MiC358IAYgC34iBkIgiHwiC0IghiAGQv////8Pg4QgD0IgiCAFIA1+fCALQiCIfIUgAykDIyAOhSIFQv////8PgyIGIAMpAxsgEoUiC0IgiCINfiIPQv////8PgyAFQiCIIgUgC0L/////D4MiC358IAYgC34iBkIgiHwiC0IghiAGQv////8Pg4QgD0IgiCAFIA1+fCALQiCIfIUgAykDEyAMhSIFQv////8PgyIGIAMpAwsgCIUiC0IgiCINfiIPQv////8PgyAFQiCIIgUgC0L/////D4MiC358IAYgC34iBkIgiHwiC0IghiAGQv////8Pg4QgD0IgiCAFIA1+fCALQiCIfIUgBEKHla+vmLbem55/fnx8fHwiBEIliCAEhUL5893xmfKZqxZ+IgRCIIggBIUhBAwBCyAEpyEAAkBBACkDoI4BIgRQDQACQCAAQRBLDQAgAEGACCAEEAUhBAwCCwJAIABBgAFLDQAgAEGACCAEEAYhBAwCCyAAQYAIIAQQByEEDAELAkAgAEEQSw0AIAAgA0IAEAUhBAwBCwJAIABBgAFLDQAgACADQgAQBiEEDAELIAAgA0IAEAchBAtBACAEQjiGIARCgP4Dg0IohoQgBEKAgPwHg0IYhiAEQoCAgPgPg0IIhoSEIARCCIhCgICA+A+DIARCGIhCgID8B4OEIARCKIhCgP4DgyAEQjiIhISENwOACiABJAALBgBBgIoBCwIACwvMAQEAQYAIC8QBuP5sOSOkS758AYEs9yGtHN7UbemDkJfbckCkpLezZx/LeeZOzMDleIJa0H3M/3IhuAhGdPdDJI7gNZDmgTomTDwoUruRwwDLiNBlixtTLqNxZEiXog35TjgZ70ap3qzYqPp2P+OcND/53LvHxwtPHYpR4EvNtFkxyJ9+ydl4c2TqxayDNNPrw8WBoP/6E2PrFw3dUbfw2knTFlUmKdRonisWvlh9R6H8j/i40XrQMc5FyzqPlRYEKK/X+8q7S0B+QAIAAA==";
      var hash$6 = "5a2fbdbb";
      var wasmJson$6 = {
        name: name$6,
        data: data$6,
        hash: hash$6
      };
      const mutex$4 = new Mutex();
      let wasmCache$4 = null;
      const seedBuffer$1 = new Uint8Array(8);
      function validateSeed$1(seed) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
          return new Error("Seed must be given as two valid 32-bit long unsigned integers (lo + high).");
        }
        return null;
      }
      function writeSeed$1(arr, low, high) {
        const buffer = new DataView(arr);
        buffer.setUint32(0, low, true);
        buffer.setUint32(4, high, true);
      }
      function xxhash3(data2, seedLow = 0, seedHigh = 0) {
        if (validateSeed$1(seedLow)) {
          return Promise.reject(validateSeed$1(seedLow));
        }
        if (validateSeed$1(seedHigh)) {
          return Promise.reject(validateSeed$1(seedHigh));
        }
        if (wasmCache$4 === null) {
          return lockedCreate(mutex$4, wasmJson$6, 8).then((wasm) => {
            wasmCache$4 = wasm;
            writeSeed$1(seedBuffer$1.buffer, seedLow, seedHigh);
            wasmCache$4.writeMemory(seedBuffer$1);
            return wasmCache$4.calculate(data2);
          });
        }
        try {
          writeSeed$1(seedBuffer$1.buffer, seedLow, seedHigh);
          wasmCache$4.writeMemory(seedBuffer$1);
          const hash2 = wasmCache$4.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createXXHash3(seedLow = 0, seedHigh = 0) {
        if (validateSeed$1(seedLow)) {
          return Promise.reject(validateSeed$1(seedLow));
        }
        if (validateSeed$1(seedHigh)) {
          return Promise.reject(validateSeed$1(seedHigh));
        }
        return WASMInterface(wasmJson$6, 8).then((wasm) => {
          const instanceBuffer = new Uint8Array(8);
          writeSeed$1(instanceBuffer.buffer, seedLow, seedHigh);
          wasm.writeMemory(instanceBuffer);
          wasm.init();
          const obj = {
            init: () => {
              wasm.writeMemory(instanceBuffer);
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 512,
            digestSize: 8
          };
          return obj;
        });
      }
      var name$5 = "xxhash128";
      var data$5 = "AGFzbQEAAAABKwdgAAF/YAR/f39/AGAHf39/f39/fwBgA39/fgF+YAR/f39+AGAAAGABfwADDQwAAQIDBAQEBQYFAAUFBAEBAgIGDgJ/AUHAjgULfwBBwAkLB3AIBm1lbW9yeQIADkhhc2hfR2V0QnVmZmVyAAAJSGFzaF9Jbml0AAcLSGFzaF9VcGRhdGUACApIYXNoX0ZpbmFsAAkNSGFzaF9HZXRTdGF0ZQAKDkhhc2hfQ2FsY3VsYXRlAAsKU1RBVEVfU0laRQMBCqBNDAUAQYAKC+QDAw9+AX8BfgJAIANFDQAgACkDMCEEIAApAzghBSAAKQMgIQYgACkDKCEHIAApAxAhCCAAKQMYIQkgACkDACEKIAApAwghCwNAIAUgAUEwaikDACIMfCACQThqKQMAIAFBOGopAwAiDYUiBUIgiCAFQv////8Pg358IQUgByABQSBqKQMAIg58IAJBKGopAwAgAUEoaikDACIPhSIHQiCIIAdC/////w+DfnwhByAJIAFBEGopAwAiEHwgAkEYaikDACABQRhqKQMAIhGFIglCIIggCUL/////D4N+fCEJIAsgASkDACISfCACQQhqIhMpAwAgAUEIaikDACIUhSILQiCIIAtC/////w+DfnwhCyACQTBqKQMAIAyFIgxCIIggDEL/////D4N+IAR8IA18IQQgAkEgaikDACAOhSIMQiCIIAxC/////w+DfiAGfCAPfCEGIAJBEGopAwAgEIUiDEIgiCAMQv////8Pg34gCHwgEXwhCCACKQMAIBKFIgxCIIggDEL/////D4N+IAp8IBR8IQogAUHAAGohASATIQIgA0F/aiIDDQALIAAgCTcDGCAAIAo3AwAgACALNwMIIAAgBzcDKCAAIAg3AxAgACAFNwM4IAAgBjcDICAAIAQ3AzALC94CAgF/AX4CQCAEIAIgASgCACIHayICSQ0AIAAgAyAFIAdBA3RqIAIQASAAIAUgBmoiBykDACAAKQMAIghCL4iFIAiFQrHz3fEJfjcDACAAIAcpAwggACkDCCIIQi+IhSAIhUKx893xCX43AwggACAHKQMQIAApAxAiCEIviIUgCIVCsfPd8Ql+NwMQIAAgBykDGCAAKQMYIghCL4iFIAiFQrHz3fEJfjcDGCAAIAcpAyAgACkDICIIQi+IhSAIhUKx893xCX43AyAgACAHKQMoIAApAygiCEIviIUgCIVCsfPd8Ql+NwMoIAAgBykDMCAAKQMwIghCL4iFIAiFQrHz3fEJfjcDMCAAIAcpAzggACkDOCIIQi+IhSAIhUKx893xCX43AzggACADIAJBBnRqIAUgBCACayIHEAEgASAHNgIADwsgACADIAUgB0EDdGogBBABIAEgByAEajYCAAvtAwEFfiABKQM4IAApAziFIgNC/////w+DIgQgASkDMCAAKQMwhSIFQiCIIgZ+IgdC/////w+DIANCIIgiAyAFQv////8PgyIFfnwgBCAFfiIEQiCIfCIFQiCGIARC/////w+DhCAHQiCIIAMgBn58IAVCIIh8hSABKQMoIAApAyiFIgNC/////w+DIgQgASkDICAAKQMghSIFQiCIIgZ+IgdC/////w+DIANCIIgiAyAFQv////8PgyIFfnwgBCAFfiIEQiCIfCIFQiCGIARC/////w+DhCAHQiCIIAMgBn58IAVCIIh8hSABKQMYIAApAxiFIgNC/////w+DIgQgASkDECAAKQMQhSIFQiCIIgZ+IgdC/////w+DIANCIIgiAyAFQv////8PgyIFfnwgBCAFfiIEQiCIfCIFQiCGIARC/////w+DhCAHQiCIIAMgBn58IAVCIIh8hSABKQMIIAApAwiFIgNC/////w+DIgQgASkDACAAKQMAhSIFQiCIIgZ+IgdC/////w+DIANCIIgiAyAFQv////8PgyIFfnwgBCAFfiIEQiCIfCIFQiCGIARC/////w+DhCAHQiCIIAMgBn58IAVCIIh8hSACfHx8fCICQiWIIAKFQvnz3fGZ8pmrFn4iAkIgiCAChQu6CAIFfgN/AkAgAUEJSQ0AIAAgAUH4iwFqKQMAIgQgAikDOCACKQMwhSADfIUiBUL/////D4NC95Svrwh+IAVCgICAgHCDfEEAKQOAjAEgAikDKCACKQMghSADfYUgBIUiA0IgiCIEQrHz3fEJfnwgBEKHla+vCH4iBEIgiHwgBEL/////D4MgA0L/////D4MiA0Kx893xCX58IANCh5Wvrwh+IgRCIIh8IgVCIIh8IgNCOIYgA0KA/gODQiiGhCADQoCA/AeDQhiGIANCgICA+A+DQgiGhIQgA0IIiEKAgID4D4MgA0IYiEKAgPwHg4QgA0IoiEKA/gODIANCOIiEhIQgBEL/////D4MgAUF/aq1CNoaEIAVCIIZ8hSIEQiCIIgVCz9bTvgJ+IgZC/////w+DIARC/////w+DIgRCvdzKlQx+fCAEQs/W074CfiIEQiCIfCIHQiCGIghCJYggCCAEQv////8Pg4SFQvnz3fGZ8pmrFn4iBEIgiCAEhTcDACAAIAVCvdzKlQx+IANCz9bTvtLHq9lCfnwgBkIgiHwgB0IgiHwiA0IliCADhUL5893xmfKZqxZ+IgNCIIggA4U3AwgPCwJAIAFBBEkNACAAIAIpAxggAikDEIUgA6ciAkEYdCACQYD+A3FBCHRyIAJBCHZBgP4DcSACQRh2cnKtQiCGIAOFfCABQfyLAWo1AgBCIIZBADUCgIwBhIUiA0IgiCIEIAFBAnRBh5Wvr3hqrSIFfiIGQiCIIARCsfPd8Ql+fCAGQv////8PgyADQv////8PgyIDQrHz3fEJfnwgAyAFfiIDQiCIfCIEQiCIfCAEQiCGIANC/////w+DhCIEQgGGfCIDQiWIIAOFQvnz3fGZ8pmrFn4iBUIgiCAFhTcDCCAAIANCA4ggBIUiA0IjiCADhUKlvuP00YyH2Z9/fiIDQhyIIAOFNwMADwsCQCABRQ0AIAAgAigCBCACKAIAc60gA3wiBEIhiEEALQCAjAFBEHQgAUEIdHIiCSABQQF2QYCMAWotAABBGHRyIgogAUH/iwFqLQAAIgFyIguthSAEhULP1tO+0ser2UJ+IgRCHYggBIVC+fPd8Zn2masWfiIEQiCIIASFNwMAIAAgAigCDCACKAIIc60gA30iA0IhiCABQRh0IAtBgP4DcUEIdHIgCUEIdkGA/gNxIApBGHZyckENd62FIAOFQs/W077Sx6vZQn4iA0IdiCADhUL5893xmfaZqxZ+IgNCIIggA4U3AwgPCyAAIAIpA1AgAikDWIUgA4UiBEIhiCAEhULP1tO+0ser2UJ+IgRCHYggBIVC+fPd8Zn2masWfiIEQiCIIASFNwMIIAAgAikDQCACKQNIhSADhSIDQiGIIAOFQs/W077Sx6vZQn4iA0IdiCADhUL5893xmfaZqxZ+IgNCIIggA4U3AwALwwoBCn4gAa0iBEKHla+vmLbem55/fiEFAkACQCABQSFPDQBCACEGDAELQgAhBwJAIAFBwQBJDQBCACEHAkAgAUHhAEkNACACQfgAaikDACADfSABQciLAWopAwAiCIUiB0L/////D4MiCSACKQNwIAN8IAFBwIsBaikDACIKhSILQiCIIgx+Ig1CIIggB0IgiCIHIAx+fCANQv////8PgyAHIAtC/////w+DIgt+fCAJIAt+IgdCIIh8IglCIIh8QQApA7iMASILQQApA7CMASIMfIUgCUIghiAHQv////8Pg4SFIQcgAkHoAGopAwAgA30gC4UiCUL/////D4MiCyACKQNgIAN8IAyFIgxCIIgiDX4iBkL/////D4MgCUIgiCIJIAxC/////w+DIgx+fCALIAx+IgtCIIh8IgxCIIYgC0L/////D4OEIAZCIIggCSANfnwgDEIgiHyFIAV8IAggCnyFIQULIAJB2ABqKQMAIAN9IAFB2IsBaikDACIIhSIJQv////8PgyIKIAIpA1AgA3wgAUHQiwFqKQMAIguFIgxCIIgiDX4iBkL/////D4MgCUIgiCIJIAxC/////w+DIgx+fCAKIAx+IgpCIIh8IgxCIIYgCkL/////D4OEIAZCIIggCSANfnwgDEIgiHyFIAd8QQApA6iMASIJQQApA6CMASIKfIUhByACQcgAaikDACADfSAJhSIJQv////8PgyIMIAIpA0AgA3wgCoUiCkIgiCINfiIGQv////8PgyAJQiCIIgkgCkL/////D4MiCn58IAwgCn4iCkIgiHwiDEIghiAKQv////8Pg4QgBkIgiCAJIA1+fCAMQiCIfIUgBXwgCCALfIUhBQsgAkE4aikDACADfSABQeiLAWopAwAiCIUiCUL/////D4MiCiACKQMwIAN8IAFB4IsBaikDACILhSIMQiCIIg1+IgZC/////w+DIAlCIIgiCSAMQv////8PgyIMfnwgCiAMfiIKQiCIfCIMQiCGIApC/////w+DhCAGQiCIIAkgDX58IAxCIIh8hSAHfEEAKQOYjAEiB0EAKQOQjAEiCXyFIQYgAkEoaikDACADfSAHhSIHQv////8PgyIKIAIpAyAgA3wgCYUiCUIgiCIMfiINQv////8PgyAHQiCIIgcgCUL/////D4MiCX58IAogCX4iCUIgiHwiCkIghiAJQv////8Pg4QgDUIgiCAHIAx+fCAKQiCIfIUgBXwgCCALfIUhBQsgACACQRhqKQMAIAN9IAFB+IsBaikDACIHhSIIQv////8PgyIJIAIpAxAgA3wgAUHwiwFqKQMAIgqFIgtCIIgiDH4iDUL/////D4MgCEIgiCIIIAtC/////w+DIgt+fCAJIAt+IglCIIh8IgtCIIYgCUL/////D4OEIA1CIIggCCAMfnwgC0IgiHyFIAZ8QQApA4iMASIIQQApA4CMASIJfIUiCyACQQhqKQMAIAN9IAiFIghC/////w+DIgwgAikDACADfCAJhSIJQiCIIg1+IgZC/////w+DIAhCIIgiCCAJQv////8PgyIJfnwgDCAJfiIJQiCIfCIMQiCGIAlC/////w+DhCAGQiCIIAggDX58IAxCIIh8hSAFfCAHIAp8hSIFfCIHQiWIIAeFQvnz3fGZ8pmrFn4iB0IgiCAHhTcDACAAQgAgBUKHla+vmLbem55/fiAEIAN9Qs/W077Sx6vZQn58IAtC49zKlfzO8vWFf358IgNCJYggA4VC+fPd8ZnymasWfiIDQiCIIAOFfTcDCAuhDwMBfxR+An9BACEEIAJB+ABqKQMAIAN9QQApA/iMASIFhSIGQv////8PgyIHIAIpA3AgA3xBACkD8IwBIgiFIglCIIgiCn4iC0L/////D4MgBkIgiCIGIAlC/////w+DIgl+fCAHIAl+IgdCIIh8IglCIIYgB0L/////D4OEIAtCIIggBiAKfnwgCUIgiHyFIAJB2ABqKQMAIAN9QQApA9iMASIHhSIGQv////8PgyIJIAIpA1AgA3xBACkD0IwBIgqFIgtCIIgiDH4iDUL/////D4MgBkIgiCIGIAtC/////w+DIgt+fCAJIAt+IglCIIh8IgtCIIYgCUL/////D4OEIA1CIIggBiAMfnwgC0IgiHyFIAJBOGopAwAgA31BACkDuIwBIgmFIgZC/////w+DIgsgAikDMCADfEEAKQOwjAEiDIUiDUIgiCIOfiIPQv////8PgyAGQiCIIgYgDUL/////D4MiDX58IAsgDX4iC0IgiHwiDUIghiALQv////8Pg4QgD0IgiCAGIA5+fCANQiCIfIUgAkEYaikDACADfUEAKQOYjAEiC4UiBkL/////D4MiDSACKQMQIAN8QQApA5CMASIOhSIPQiCIIhB+IhFC/////w+DIAZCIIgiBiAPQv////8PgyIPfnwgDSAPfiINQiCIfCIPQiCGIA1C/////w+DhCARQiCIIAYgEH58IA9CIIh8hUEAKQOIjAEiDUEAKQOAjAEiD3yFfEEAKQOojAEiEEEAKQOgjAEiEXyFfEEAKQPIjAEiEkEAKQPAjAEiE3yFfEEAKQPojAEiFEEAKQPgjAEiFXyFIgZCJYggBoVC+fPd8ZnymasWfiIGQiCIIAaFIQYgAkHoAGopAwAgA30gFIUiFEL/////D4MiFiACKQNgIAN8IBWFIhVCIIgiF34iGEL/////D4MgFEIgiCIUIBVC/////w+DIhV+fCAWIBV+IhVCIIh8IhZCIIYgFUL/////D4OEIBhCIIggFCAXfnwgFkIgiHyFIAJByABqKQMAIAN9IBKFIhJC/////w+DIhQgAikDQCADfCAThSITQiCIIhV+IhZC/////w+DIBJCIIgiEiATQv////8PgyITfnwgFCATfiITQiCIfCIUQiCGIBNC/////w+DhCAWQiCIIBIgFX58IBRCIIh8hSACQShqKQMAIAN9IBCFIhBC/////w+DIhIgAikDICADfCARhSIRQiCIIhN+IhRC/////w+DIBBCIIgiECARQv////8PgyIRfnwgEiARfiIRQiCIfCISQiCGIBFC/////w+DhCAUQiCIIBAgE358IBJCIIh8hSACQQhqKQMAIAN9IA2FIg1C/////w+DIhAgAikDACADfCAPhSIPQiCIIhF+IhJC/////w+DIA1CIIgiDSAPQv////8PgyIPfnwgECAPfiIPQiCIfCIQQiCGIA9C/////w+DhCASQiCIIA0gEX58IBBCIIh8hSABrSIPQoeVr6+Ytt6bnn9+fCALIA58hXwgCSAMfIV8IAcgCnyFfCAFIAh8hSIFQiWIIAWFQvnz3fGZ8pmrFn4iBUIgiCAFhSEFAkAgAUGgAUgNACABQQV2QXxqIRkDQCACIARqIhpBG2opAwAgA30gBEGYjQFqKQMAIgeFIghC/////w+DIgkgGkETaikDACADfCAEQZCNAWopAwAiCoUiC0IgiCIMfiINQv////8PgyAIQiCIIgggC0L/////D4MiC358IAkgC34iCUIgiHwiC0IghiAJQv////8Pg4QgDUIgiCAIIAx+fCALQiCIfIUgBnwgBEGIjQFqKQMAIgggBEGAjQFqKQMAIgl8hSEGIBpBC2opAwAgA30gCIUiCEL/////D4MiCyAaQQNqKQMAIAN8IAmFIglCIIgiDH4iDUL/////D4MgCEIgiCIIIAlC/////w+DIgl+fCALIAl+IglCIIh8IgtCIIYgCUL/////D4OEIA1CIIggCCAMfnwgC0IgiHyFIAV8IAcgCnyFIQUgBEEgaiEEIBlBf2oiGQ0ACwsgACACQf8AaikDACADfCABQeiLAWopAwAiB4UiCEL/////D4MiCSACKQN3IAN9IAFB4IsBaikDACIKhSILQiCIIgx+Ig1C/////w+DIAhCIIgiCCALQv////8PgyILfnwgCSALfiIJQiCIfCILQiCGIAlC/////w+DhCANQiCIIAggDH58IAtCIIh8hSAGfCABQfiLAWopAwAiBiABQfCLAWopAwAiCHyFIgkgAkHvAGopAwAgA3wgBoUiBkL/////D4MiCyACKQNnIAN9IAiFIghCIIgiDH4iDUL/////D4MgBkIgiCIGIAhC/////w+DIgh+fCALIAh+IghCIIh8IgtCIIYgCEL/////D4OEIA1CIIggBiAMfnwgC0IgiHyFIAV8IAcgCnyFIgZ8IgVCJYggBYVC+fPd8ZnymasWfiIFQiCIIAWFNwMAIABCACAGQoeVr6+Ytt6bnn9+IA8gA31Cz9bTvtLHq9lCfnwgCULj3MqV/M7y9YV/fnwiA0IliCADhUL5893xmfKZqxZ+IgNCIIggA4V9NwMIC98FAgF+AX8CQAJAQQApA4AKIgBQRQ0AQYAIIQFCACEADAELAkBBACkDoI4BIABSDQBBACEBDAELQQAhAUEAQq+v79e895Kg/gAgAH03A/iLAUEAIABCxZbr+djShYIofDcD8IsBQQBCj/Hjja2P9JhOIAB9NwPoiwFBACAAQqus+MXV79HQfHw3A+CLAUEAQtOt1LKShbW0nn8gAH03A9iLAUEAIABCl5r0jvWWvO3JAHw3A9CLAUEAQsWDgv2v/8SxayAAfTcDyIsBQQAgAELqi7OdyOb09UN8NwPAiwFBAELIv/rLnJveueQAIAB9NwO4iwFBACAAQoqjgd/Ume2sMXw3A7CLAUEAQvm57738+MKnHSAAfTcDqIsBQQAgAEKo9dv7s5ynmj98NwOgiwFBAEK4sry3lNW31lggAH03A5iLAUEAIABC8cihuqm0w/zOAHw3A5CLAUEAQoihl9u445SXo38gAH03A4iL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AkHAAGogDGohC0GAjAEhAAJAAkACQCAHQQhJDQACQCAHQThqQQN2QQFqQQdxIg0NAAwCCyANQQN0IQ5BgIwBIQADQCALIAApAwA3AwAgC0EIaiELIABBCGohACANQX9qIg0NAAsgByAOayEHCyAHRQ0BAkACQCAHQQdxIg4NACAHIQ0MAQsgB0F4cSENA0AgCyAALQAAOgAAIAtBAWohCyAAQQFqIQAgDkF/aiIODQALCyAHQQhJDQELA0AgCyAAKQAANwAAIAtBCGohCyAAQQhqIQAgDUF4aiINDQALCyACIAIpAwggAikDQCIIfCADQQAoApyOAWoiACkDASACKQNIIgmFIgpCIIggCkL/////D4N+fDcDCCACIAIpAxggAikDUCIKfCAAKQMRIAIpA1giEIUiEUIgiCARQv////8Pg358NwMYIAIgECAKIAApAwmFIgpCIIggCkL/////D4N+IAIpAxB8fDcDECACIAkgCCAAQXlqKQMAhSIIQiCIIAhC/////w+DfiACKQMAfHw3AwAgACkDGSEIIAIpAyAhCSACIAIpAyggAikDYCIKfCAAKQMhIAIpA2giEIUiEUIgiCARQv////8Pg358NwMoIAIgECAJIAggCoUiCEIgiCAIQv////8Pg358fDcDICACIAYgAikDcCIIfCAAKQMxIAIpA3giBoUiCUIgiCAJQv////8Pg358NwM4IAIgBiAIIAApAymFIghCIIggCEL/////D4N+IAV8fDcDMAsgAiACIANBC2ogBEKHla+vmLbem55/fhADNwNAIAIgAiADQQAoApyOAWpBdWogBELP1tO+0ser2UJ+Qn+FEAM3A0gMAQsgBKchAAJAQQApA6COASIEUA0AAkAgAEEQSw0AIAJBwABqIABBgAggBBAEDAILAkAgAEGAAUsNACACQcAAaiAAQYAIIAQQBQwCCyACQcAAaiAAQYAIIAQQBgwBCwJAIABBEEsNACACQcAAaiAAIANCABAEDAELAkAgAEGAAUsNACACQcAAaiAAIANCABAFDAELIAJBwABqIAAgA0IAEAYLQQAgAikDcDcDuApBACACKQNgNwOoCkEAIAIpA1A3A5gKQQAgAkH4AGopAwA3A8AKQQAgAkHoAGopAwA3A7AKQQAgAkHYAGopAwA3A6AKQQAgAikDSCIEQjiGIARCgP4Dg0IohoQgBEKAgPwHg0IYhiAEQoCAgPgPg0IIhoSEIARCCIhCgICA+A+DIARCGIhCgID8B4OEIARCKIhCgP4DgyAEQjiIhISEIgQ3A4AKQQAgBDcDkApBACACKQNAIgRCOIYgBEKA/gODQiiGhCAEQoCA/AeDQhiGIARCgICA+A+DQgiGhIQgBEIIiEKAgID4D4MgBEIYiEKAgPwHg4QgBEIoiEKA/gODIARCOIiEhIQ3A4gKIAEkAAsGAEGAigELAgALC8wBAQBBgAgLxAG4/mw5I6RLvnwBgSz3Ia0c3tRt6YOQl9tyQKSkt7NnH8t55k7MwOV4glrQfcz/ciG4CEZ090MkjuA1kOaBOiZMPChSu5HDAMuI0GWLG1Muo3FkSJeiDflOOBnvRqnerNio+nY/45w0P/ncu8fHC08dilHgS820WTHIn37J2XhzZOrFrIM00+vDxYGg//oTY+sXDd1Rt/DaSdMWVSYp1GieKxa+WH1HofyP+LjRetAxzkXLOo+VFgQor9f7yrtLQH5AAgAA";
      var hash$5 = "b9ab74e2";
      var wasmJson$5 = {
        name: name$5,
        data: data$5,
        hash: hash$5
      };
      const mutex$3 = new Mutex();
      let wasmCache$3 = null;
      const seedBuffer = new Uint8Array(8);
      function validateSeed(seed) {
        if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
          return new Error("Seed must be given as two valid 32-bit long unsigned integers (lo + high).");
        }
        return null;
      }
      function writeSeed(arr, low, high) {
        const buffer = new DataView(arr);
        buffer.setUint32(0, low, true);
        buffer.setUint32(4, high, true);
      }
      function xxhash128(data2, seedLow = 0, seedHigh = 0) {
        if (validateSeed(seedLow)) {
          return Promise.reject(validateSeed(seedLow));
        }
        if (validateSeed(seedHigh)) {
          return Promise.reject(validateSeed(seedHigh));
        }
        if (wasmCache$3 === null) {
          return lockedCreate(mutex$3, wasmJson$5, 16).then((wasm) => {
            wasmCache$3 = wasm;
            writeSeed(seedBuffer.buffer, seedLow, seedHigh);
            wasmCache$3.writeMemory(seedBuffer);
            return wasmCache$3.calculate(data2);
          });
        }
        try {
          writeSeed(seedBuffer.buffer, seedLow, seedHigh);
          wasmCache$3.writeMemory(seedBuffer);
          const hash2 = wasmCache$3.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createXXHash128(seedLow = 0, seedHigh = 0) {
        if (validateSeed(seedLow)) {
          return Promise.reject(validateSeed(seedLow));
        }
        if (validateSeed(seedHigh)) {
          return Promise.reject(validateSeed(seedHigh));
        }
        return WASMInterface(wasmJson$5, 16).then((wasm) => {
          const instanceBuffer = new Uint8Array(8);
          writeSeed(instanceBuffer.buffer, seedLow, seedHigh);
          wasm.writeMemory(instanceBuffer);
          wasm.init();
          const obj = {
            init: () => {
              wasm.writeMemory(instanceBuffer);
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 512,
            digestSize: 16
          };
          return obj;
        });
      }
      var name$4 = "ripemd160";
      var data$4 = "AGFzbQEAAAABEQRgAAF/YAAAYAF/AGACf38AAwkIAAECAwIBAAIFBAEBAgIGDgJ/AUHgiQULfwBBgAgLB4MBCQZtZW1vcnkCAA5IYXNoX0dldEJ1ZmZlcgAACUhhc2hfSW5pdAABEHJpcGVtZDE2MF91cGRhdGUAAwtIYXNoX1VwZGF0ZQAECkhhc2hfRmluYWwABQ1IYXNoX0dldFN0YXRlAAYOSGFzaF9DYWxjdWxhdGUABwpTVEFURV9TSVpFAwEKzzIIBQBBgAkLOgBBAEHww8uefDYCmIkBQQBC/rnrxemOlZkQNwKQiQFBAEKBxpS6lvHq5m83AoiJAUEAQgA3AoCJAQuPLAEhf0EAIAAoAiQiASAAKAIAIgIgACgCECIDIAIgACgCLCIEIAAoAgwiBSAAKAIEIgYgACgCPCIHIAIgACgCMCIIIAcgACgCCCIJQQAoAoiJASIKQQAoApCJASILQQAoApSJASIMQX9zckEAKAKMiQEiDXNqIAAoAhQiDmpB5peKhQVqQQh3QQAoApiJASIPaiIQQQp3IhFqIAEgDUEKdyISaiACIAtBCnciE2ogDCAAKAIcIhRqIA8gACgCOCIVaiAQIA0gE0F/c3JzakHml4qFBWpBCXcgDGoiFiAQIBJBf3Nyc2pB5peKhQVqQQl3IBNqIhAgFiARQX9zcnNqQeaXioUFakELdyASaiIXIBAgFkEKdyIWQX9zcnNqQeaXioUFakENdyARaiIYIBcgEEEKdyIZQX9zcnNqQeaXioUFakEPdyAWaiIaQQp3IhtqIAAoAhgiECAYQQp3IhxqIAAoAjQiESAXQQp3IhdqIAMgGWogBCAWaiAaIBggF0F/c3JzakHml4qFBWpBD3cgGWoiFiAaIBxBf3Nyc2pB5peKhQVqQQV3IBdqIhcgFiAbQX9zcnNqQeaXioUFakEHdyAcaiIYIBcgFkEKdyIZQX9zcnNqQeaXioUFakEHdyAbaiIaIBggF0EKdyIXQX9zcnNqQeaXioUFakEIdyAZaiIbQQp3IhxqIAUgGkEKdyIdaiAAKAIoIhYgGEEKdyIYaiAGIBdqIAAoAiAiACAZaiAbIBogGEF/c3JzakHml4qFBWpBC3cgF2oiFyAbIB1Bf3Nyc2pB5peKhQVqQQ53IBhqIhggFyAcQX9zcnNqQeaXioUFakEOdyAdaiIZIBggF0EKdyIaQX9zcnNqQeaXioUFakEMdyAcaiIbIBkgGEEKdyIcQX9zcnNqQeaXioUFakEGdyAaaiIdQQp3IhdqIAUgGUEKdyIYaiAQIBpqIBsgGEF/c3FqIB0gGHFqQaSit+IFakEJdyAcaiIaIBdBf3NxaiAEIBxqIB0gG0EKdyIZQX9zcWogGiAZcWpBpKK34gVqQQ13IBhqIhsgF3FqQaSit+IFakEPdyAZaiIcIBtBCnciGEF/c3FqIBQgGWogGyAaQQp3IhlBf3NxaiAcIBlxakGkorfiBWpBB3cgF2oiGyAYcWpBpKK34gVqQQx3IBlqIh1BCnciF2ogFiAcQQp3IhpqIBEgGWogGyAaQX9zcWogHSAacWpBpKK34gVqQQh3IBhqIhwgF0F/c3FqIA4gGGogHSAbQQp3IhhBf3NxaiAcIBhxakGkorfiBWpBCXcgGmoiGiAXcWpBpKK34gVqQQt3IBhqIhsgGkEKdyIZQX9zcWogFSAYaiAaIBxBCnciGEF/c3FqIBsgGHFqQaSit+IFakEHdyAXaiIcIBlxakGkorfiBWpBB3cgGGoiHUEKdyIXaiADIBtBCnciGmogACAYaiAcIBpBf3NxaiAdIBpxakGkorfiBWpBDHcgGWoiGyAXQX9zcWogCCAZaiAdIBxBCnciGEF/c3FqIBsgGHFqQaSit+IFakEHdyAaaiIaIBdxakGkorfiBWpBBncgGGoiHCAaQQp3IhlBf3NxaiABIBhqIBogG0EKdyIYQX9zcWogHCAYcWpBpKK34gVqQQ93IBdqIhogGXFqQaSit+IFakENdyAYaiIbQQp3Ih1qIAYgGkEKdyIeaiAOIBxBCnciF2ogByAZaiAJIBhqIBogF0F/c3FqIBsgF3FqQaSit+IFakELdyAZaiIYIBtBf3NyIB5zakHz/cDrBmpBCXcgF2oiFyAYQX9zciAdc2pB8/3A6wZqQQd3IB5qIhkgF0F/c3IgGEEKdyIYc2pB8/3A6wZqQQ93IB1qIhogGUF/c3IgF0EKdyIXc2pB8/3A6wZqQQt3IBhqIhtBCnciHGogASAaQQp3Ih1qIBAgGUEKdyIZaiAVIBdqIBQgGGogGyAaQX9zciAZc2pB8/3A6wZqQQh3IBdqIhcgG0F/c3IgHXNqQfP9wOsGakEGdyAZaiIYIBdBf3NyIBxzakHz/cDrBmpBBncgHWoiGSAYQX9zciAXQQp3IhdzakHz/cDrBmpBDncgHGoiGiAZQX9zciAYQQp3IhhzakHz/cDrBmpBDHcgF2oiG0EKdyIcaiAWIBpBCnciHWogCSAZQQp3IhlqIAggGGogACAXaiAbIBpBf3NyIBlzakHz/cDrBmpBDXcgGGoiFyAbQX9zciAdc2pB8/3A6wZqQQV3IBlqIhggF0F/c3IgHHNqQfP9wOsGakEOdyAdaiIZIBhBf3NyIBdBCnciF3NqQfP9wOsGakENdyAcaiIaIBlBf3NyIBhBCnciGHNqQfP9wOsGakENdyAXaiIbQQp3IhxqIBEgGGogAyAXaiAbIBpBf3NyIBlBCnciGXNqQfP9wOsGakEHdyAYaiIYIBtBf3NyIBpBCnciGnNqQfP9wOsGakEFdyAZaiIXQQp3IhsgECAaaiAYQQp3Ih0gACAZaiAcIBdBf3NxaiAXIBhxakHp7bXTB2pBD3cgGmoiGEF/c3FqIBggF3FqQenttdMHakEFdyAcaiIXQX9zcWogFyAYcWpB6e210wdqQQh3IB1qIhlBCnciGmogBSAbaiAXQQp3IhwgBiAdaiAYQQp3Ih0gGUF/c3FqIBkgF3FqQenttdMHakELdyAbaiIXQX9zcWogFyAZcWpB6e210wdqQQ53IB1qIhhBCnciGyAHIBxqIBdBCnciHiAEIB1qIBogGEF/c3FqIBggF3FqQenttdMHakEOdyAcaiIXQX9zcWogFyAYcWpB6e210wdqQQZ3IBpqIhhBf3NxaiAYIBdxakHp7bXTB2pBDncgHmoiGUEKdyIaaiAIIBtqIBhBCnciHCAOIB5qIBdBCnciHSAZQX9zcWogGSAYcWpB6e210wdqQQZ3IBtqIhdBf3NxaiAXIBlxakHp7bXTB2pBCXcgHWoiGEEKdyIbIBEgHGogF0EKdyIeIAkgHWogGiAYQX9zcWogGCAXcWpB6e210wdqQQx3IBxqIhdBf3NxaiAXIBhxakHp7bXTB2pBCXcgGmoiGEF/c3FqIBggF3FqQenttdMHakEMdyAeaiIZQQp3IhogB2ogFSAXQQp3IhxqIBogFiAbaiAYQQp3Ih0gFCAeaiAcIBlBf3NxaiAZIBhxakHp7bXTB2pBBXcgG2oiF0F/c3FqIBcgGXFqQenttdMHakEPdyAcaiIYQX9zcWogGCAXcWpB6e210wdqQQh3IB1qIhkgGEEKdyIbcyAdIAhqIBggF0EKdyIXcyAZc2pBCHcgGmoiGHNqQQV3IBdqIhpBCnciHCAAaiAZQQp3IhkgBmogFyAWaiAYIBlzIBpzakEMdyAbaiIXIBxzIBsgA2ogGiAYQQp3IhhzIBdzakEJdyAZaiIZc2pBDHcgGGoiGiAZQQp3IhtzIBggDmogGSAXQQp3IhdzIBpzakEFdyAcaiIYc2pBDncgF2oiGUEKdyIcIBVqIBpBCnciGiAJaiAXIBRqIBggGnMgGXNqQQZ3IBtqIhcgHHMgGyAQaiAZIBhBCnciGHMgF3NqQQh3IBpqIhlzakENdyAYaiIaIBlBCnciG3MgGCARaiAZIBdBCnciGHMgGnNqQQZ3IBxqIhlzakEFdyAYaiIcQQp3Ih0gDGogBCAWIA4gDiARIBYgDiAUIAEgACABIBAgFCAEIBAgBiAPaiATIA1zIAsgDXMgDHMgCmogAmpBC3cgD2oiF3NqQQ53IAxqIh5BCnciH2ogAyASaiAJIAxqIBcgEnMgHnNqQQ93IBNqIgwgH3MgBSATaiAeIBdBCnciE3MgDHNqQQx3IBJqIhJzakEFdyATaiIXIBJBCnciHnMgEyAOaiASIAxBCnciDHMgF3NqQQh3IB9qIhJzakEHdyAMaiITQQp3Ih9qIAEgF0EKdyIXaiAMIBRqIBIgF3MgE3NqQQl3IB5qIgwgH3MgHiAAaiATIBJBCnciEnMgDHNqQQt3IBdqIhNzakENdyASaiIXIBNBCnciHnMgEiAWaiATIAxBCnciDHMgF3NqQQ53IB9qIhJzakEPdyAMaiITQQp3Ih9qIB4gEWogEyASQQp3IiBzIAwgCGogEiAXQQp3IgxzIBNzakEGdyAeaiISc2pBB3cgDGoiE0EKdyIXICAgB2ogEyASQQp3Ih5zIAwgFWogEiAfcyATc2pBCXcgIGoiE3NqQQh3IB9qIgxBf3NxaiAMIBNxakGZ84nUBWpBB3cgHmoiEkEKdyIfaiARIBdqIAxBCnciICADIB5qIBNBCnciEyASQX9zcWogEiAMcWpBmfOJ1AVqQQZ3IBdqIgxBf3NxaiAMIBJxakGZ84nUBWpBCHcgE2oiEkEKdyIXIBYgIGogDEEKdyIeIAYgE2ogHyASQX9zcWogEiAMcWpBmfOJ1AVqQQ13ICBqIgxBf3NxaiAMIBJxakGZ84nUBWpBC3cgH2oiEkF/c3FqIBIgDHFqQZnzidQFakEJdyAeaiITQQp3Ih9qIAUgF2ogEkEKdyIgIAcgHmogDEEKdyIeIBNBf3NxaiATIBJxakGZ84nUBWpBB3cgF2oiDEF/c3FqIAwgE3FqQZnzidQFakEPdyAeaiISQQp3IhcgAiAgaiAMQQp3IiEgCCAeaiAfIBJBf3NxaiASIAxxakGZ84nUBWpBB3cgIGoiDEF/c3FqIAwgEnFqQZnzidQFakEMdyAfaiISQX9zcWogEiAMcWpBmfOJ1AVqQQ93ICFqIhNBCnciHmogCSAXaiASQQp3Ih8gDiAhaiAMQQp3IiAgE0F/c3FqIBMgEnFqQZnzidQFakEJdyAXaiIMQX9zcWogDCATcWpBmfOJ1AVqQQt3ICBqIhJBCnciEyAEIB9qIAxBCnciFyAVICBqIB4gEkF/c3FqIBIgDHFqQZnzidQFakEHdyAfaiIMQX9zcWogDCAScWpBmfOJ1AVqQQ13IB5qIhJBf3MiIHFqIBIgDHFqQZnzidQFakEMdyAXaiIeQQp3Ih9qIAMgEkEKdyISaiAVIAxBCnciDGogFiATaiAFIBdqIB4gIHIgDHNqQaHX5/YGakELdyATaiITIB5Bf3NyIBJzakGh1+f2BmpBDXcgDGoiDCATQX9zciAfc2pBodfn9gZqQQZ3IBJqIhIgDEF/c3IgE0EKdyITc2pBodfn9gZqQQd3IB9qIhcgEkF/c3IgDEEKdyIMc2pBodfn9gZqQQ53IBNqIh5BCnciH2ogCSAXQQp3IiBqIAYgEkEKdyISaiAAIAxqIAcgE2ogHiAXQX9zciASc2pBodfn9gZqQQl3IAxqIgwgHkF/c3IgIHNqQaHX5/YGakENdyASaiISIAxBf3NyIB9zakGh1+f2BmpBD3cgIGoiEyASQX9zciAMQQp3IgxzakGh1+f2BmpBDncgH2oiFyATQX9zciASQQp3IhJzakGh1+f2BmpBCHcgDGoiHkEKdyIfaiAEIBdBCnciIGogESATQQp3IhNqIBAgEmogAiAMaiAeIBdBf3NyIBNzakGh1+f2BmpBDXcgEmoiDCAeQX9zciAgc2pBodfn9gZqQQZ3IBNqIhIgDEF/c3IgH3NqQaHX5/YGakEFdyAgaiITIBJBf3NyIAxBCnciF3NqQaHX5/YGakEMdyAfaiIeIBNBf3NyIBJBCnciEnNqQaHX5/YGakEHdyAXaiIfQQp3IgxqIAEgE0EKdyITaiAIIBdqIB8gHkF/c3IgE3NqQaHX5/YGakEFdyASaiIXIAxBf3NxaiAGIBJqIB8gHkEKdyISQX9zcWogFyAScWpB3Pnu+HhqQQt3IBNqIh4gDHFqQdz57vh4akEMdyASaiIfIB5BCnciE0F/c3FqIAQgEmogHiAXQQp3IhJBf3NxaiAfIBJxakHc+e74eGpBDncgDGoiHiATcWpB3Pnu+HhqQQ93IBJqIiBBCnciDGogCCAfQQp3IhdqIAIgEmogHiAXQX9zcWogICAXcWpB3Pnu+HhqQQ53IBNqIh8gDEF/c3FqIAAgE2ogICAeQQp3IhJBf3NxaiAfIBJxakHc+e74eGpBD3cgF2oiFyAMcWpB3Pnu+HhqQQl3IBJqIh4gF0EKdyITQX9zcWogAyASaiAXIB9BCnciEkF/c3FqIB4gEnFqQdz57vh4akEIdyAMaiIfIBNxakHc+e74eGpBCXcgEmoiIEEKdyIMaiAHIB5BCnciF2ogBSASaiAfIBdBf3NxaiAgIBdxakHc+e74eGpBDncgE2oiHiAMQX9zcWogFCATaiAgIB9BCnciEkF/c3FqIB4gEnFqQdz57vh4akEFdyAXaiIXIAxxakHc+e74eGpBBncgEmoiHyAXQQp3IhNBf3NxaiAVIBJqIBcgHkEKdyISQX9zcWogHyAScWpB3Pnu+HhqQQh3IAxqIhcgE3FqQdz57vh4akEGdyASaiIeQQp3IiBqIAIgF0EKdyIOaiADIB9BCnciDGogCSATaiAeIA5Bf3NxaiAQIBJqIBcgDEF/c3FqIB4gDHFqQdz57vh4akEFdyATaiIDIA5xakHc+e74eGpBDHcgDGoiDCADICBBf3Nyc2pBzvrPynpqQQl3IA5qIg4gDCADQQp3IgNBf3Nyc2pBzvrPynpqQQ93ICBqIhIgDiAMQQp3IgxBf3Nyc2pBzvrPynpqQQV3IANqIhNBCnciF2ogCSASQQp3IhZqIAggDkEKdyIJaiAUIAxqIAEgA2ogEyASIAlBf3Nyc2pBzvrPynpqQQt3IAxqIgMgEyAWQX9zcnNqQc76z8p6akEGdyAJaiIIIAMgF0F/c3JzakHO+s/KempBCHcgFmoiCSAIIANBCnciA0F/c3JzakHO+s/KempBDXcgF2oiDiAJIAhBCnciCEF/c3JzakHO+s/KempBDHcgA2oiFEEKdyIWaiAAIA5BCnciDGogBSAJQQp3IgBqIAYgCGogFSADaiAUIA4gAEF/c3JzakHO+s/KempBBXcgCGoiAyAUIAxBf3Nyc2pBzvrPynpqQQx3IABqIgAgAyAWQX9zcnNqQc76z8p6akENdyAMaiIGIAAgA0EKdyIDQX9zcnNqQc76z8p6akEOdyAWaiIIIAYgAEEKdyIAQX9zcnNqQc76z8p6akELdyADaiIJQQp3IhVqNgKQiQFBACALIBggAmogGSAaQQp3IgJzIBxzakEPdyAbaiIOQQp3IhZqIBAgA2ogCSAIIAZBCnciA0F/c3JzakHO+s/KempBCHcgAGoiBkEKd2o2AoyJAUEAIA0gGyAFaiAcIBlBCnciBXMgDnNqQQ13IAJqIhRBCndqIAcgAGogBiAJIAhBCnciAEF/c3JzakHO+s/KempBBXcgA2oiB2o2AoiJAUEAIAAgCmogAiABaiAOIB1zIBRzakELdyAFaiIBaiARIANqIAcgBiAVQX9zcnNqQc76z8p6akEGd2o2ApiJAUEAIAAgD2ogHWogBSAEaiAUIBZzIAFzakELd2o2ApSJAQuiAwEIfwJAIAFFDQBBACECQQBBACgCgIkBIgMgAWoiBDYCgIkBIANBP3EhBQJAIAQgA08NAEEAQQAoAoSJAUEBajYChIkBCwJAIAVFDQACQCABQcAAIAVrIgZPDQAgBSECDAELIAZBA3EhB0EAIQMCQCAFQT9zQQNJDQAgBUGAiQFqIQggBkH8AHEhCUEAIQMDQCAIIANqIgJBHGogACADaiIELQAAOgAAIAJBHWogBEEBai0AADoAACACQR5qIARBAmotAAA6AAAgAkEfaiAEQQNqLQAAOgAAIAkgA0EEaiIDRw0ACwsCQCAHRQ0AIAAgA2ohAiADIAVqQZyJAWohAwNAIAMgAi0AADoAACACQQFqIQIgA0EBaiEDIAdBf2oiBw0ACwtBnIkBEAIgASAGayEBIAAgBmohAEEAIQILAkAgAUHAAEkNAANAIAAQAiAAQcAAaiEAIAFBQGoiAUE/Sw0ACwsgAUUNACACQZyJAWohA0EAIQIDQCADIAAtAAA6AAAgAEEBaiEAIANBAWohAyABIAJBAWoiAkH/AXFLDQALCwsJAEGACSAAEAMLggEBAn8jAEEQayIAJAAgAEEAKAKAiQEiAUEDdDYCCCAAQQAoAoSJAUEDdCABQR12cjYCDEGQCEE4QfgAIAFBP3EiAUE4SRsgAWsQAyAAQQhqQQgQA0EAQQAoAoiJATYCgAlBAEEAKQKMiQE3AoQJQQBBACkClIkBNwKMCSAAQRBqJAALBgBBgIkBC8EBAQF/IwBBEGsiASQAQQBB8MPLnnw2ApiJAUEAQv6568XpjpWZEDcCkIkBQQBCgcaUupbx6uZvNwKIiQFBAEIANwKAiQFBgAkgABADIAFBACgCgIkBIgBBA3Q2AgggAUEAKAKEiQFBA3QgAEEddnI2AgxBkAhBOEH4ACAAQT9xIgBBOEkbIABrEAMgAUEIakEIEANBAEEAKAKIiQE2AoAJQQBBACkCjIkBNwKECUEAQQApApSJATcCjAkgAUEQaiQACwtXAQBBgAgLUFwAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      var hash$4 = "6abbce74";
      var wasmJson$4 = {
        name: name$4,
        data: data$4,
        hash: hash$4
      };
      const mutex$2 = new Mutex();
      let wasmCache$2 = null;
      function ripemd160(data2) {
        if (wasmCache$2 === null) {
          return lockedCreate(mutex$2, wasmJson$4, 20).then((wasm) => {
            wasmCache$2 = wasm;
            return wasmCache$2.calculate(data2);
          });
        }
        try {
          const hash2 = wasmCache$2.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createRIPEMD160() {
        return WASMInterface(wasmJson$4, 20).then((wasm) => {
          wasm.init();
          const obj = {
            init: () => {
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: 20
          };
          return obj;
        });
      }
      function calculateKeyBuffer(hasher, key) {
        const { blockSize } = hasher;
        const buf = getUInt8Buffer(key);
        if (buf.length > blockSize) {
          hasher.update(buf);
          const uintArr = hasher.digest("binary");
          hasher.init();
          return uintArr;
        }
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
      }
      function calculateHmac(hasher, key) {
        hasher.init();
        const { blockSize } = hasher;
        const keyBuf = calculateKeyBuffer(hasher, key);
        const keyBuffer = new Uint8Array(blockSize);
        keyBuffer.set(keyBuf);
        const opad = new Uint8Array(blockSize);
        for (let i = 0; i < blockSize; i++) {
          const v = keyBuffer[i];
          opad[i] = v ^ 92;
          keyBuffer[i] = v ^ 54;
        }
        hasher.update(keyBuffer);
        const obj = {
          init: () => {
            hasher.init();
            hasher.update(keyBuffer);
            return obj;
          },
          update: (data2) => {
            hasher.update(data2);
            return obj;
          },
          digest: (outputType) => {
            const uintArr = hasher.digest("binary");
            hasher.init();
            hasher.update(opad);
            hasher.update(uintArr);
            return hasher.digest(outputType);
          },
          save: () => {
            throw new Error("save() not supported");
          },
          load: () => {
            throw new Error("load() not supported");
          },
          blockSize: hasher.blockSize,
          digestSize: hasher.digestSize
        };
        return obj;
      }
      function createHMAC(hash2, key) {
        if (!hash2 || !hash2.then) {
          throw new Error('Invalid hash function is provided! Usage: createHMAC(createMD5(), "key").');
        }
        return hash2.then((hasher) => calculateHmac(hasher, key));
      }
      function calculatePBKDF2(digest, salt, iterations, hashLength, outputType) {
        return __awaiter(this, void 0, void 0, function* () {
          const DK = new Uint8Array(hashLength);
          const block1 = new Uint8Array(salt.length + 4);
          const block1View = new DataView(block1.buffer);
          const saltBuffer = getUInt8Buffer(salt);
          const saltUIntBuffer = new Uint8Array(saltBuffer.buffer, saltBuffer.byteOffset, saltBuffer.length);
          block1.set(saltUIntBuffer);
          let destPos = 0;
          const hLen = digest.digestSize;
          const l = Math.ceil(hashLength / hLen);
          let T = null;
          let U = null;
          for (let i = 1; i <= l; i++) {
            block1View.setUint32(salt.length, i);
            digest.init();
            digest.update(block1);
            T = digest.digest("binary");
            U = T.slice();
            for (let j = 1; j < iterations; j++) {
              digest.init();
              digest.update(U);
              U = digest.digest("binary");
              for (let k = 0; k < hLen; k++) {
                T[k] ^= U[k];
              }
            }
            DK.set(T.subarray(0, hashLength - destPos), destPos);
            destPos += hLen;
          }
          if (outputType === "binary") {
            return DK;
          }
          const digestChars = new Uint8Array(hashLength * 2);
          return getDigestHex(digestChars, DK, hashLength);
        });
      }
      const validateOptions$2 = (options) => {
        if (!options || typeof options !== "object") {
          throw new Error("Invalid options parameter. It requires an object.");
        }
        if (!options.hashFunction || !options.hashFunction.then) {
          throw new Error('Invalid hash function is provided! Usage: pbkdf2("password", "salt", 1000, 32, createSHA1()).');
        }
        if (!Number.isInteger(options.iterations) || options.iterations < 1) {
          throw new Error("Iterations should be a positive number");
        }
        if (!Number.isInteger(options.hashLength) || options.hashLength < 1) {
          throw new Error("Hash length should be a positive number");
        }
        if (options.outputType === void 0) {
          options.outputType = "hex";
        }
        if (!["hex", "binary"].includes(options.outputType)) {
          throw new Error(`Insupported output type ${options.outputType}. Valid values: ['hex', 'binary']`);
        }
      };
      function pbkdf2(options) {
        return __awaiter(this, void 0, void 0, function* () {
          validateOptions$2(options);
          const hmac = yield createHMAC(options.hashFunction, options.password);
          return calculatePBKDF2(hmac, options.salt, options.iterations, options.hashLength, options.outputType);
        });
      }
      var name$3 = "scrypt";
      var data$3 = "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cyICajYCOCAAIAAoAjwgAiAKakESdyAGc2o2AjwLvxIDFX8Bfg5/AkAgAkUNACAAQQd0IgNBQGoiBEEAKAKACCIFIAMgAmwiBmogAyABbGoiByADaiIIaiEJIAAgAkEHdCIKIAFBB3RqIgtsIQwgACALQYABamwhDSAAQQV0IgtBASALQQFLGyILQWBxIQ4gC0EBcSEPIAdBeGohECAHQXBqIREgB0FoaiESIAdBYGohEyAHQVhqIRQgB0FQaiEVIAdBSGohFiAHQUBqIRcgAa1Cf3whGCAEIAdqIRkgByAAQQh0IhpqIRsgACAKQYABamwhHCALQQRJIR1BACEeQQAhHwNAQQAoAoAIIiAgAyAfbGohIQJAIABFDQBBACEiAkAgHQ0AICAgHmohI0EAIQtBACEiA0AgByALaiIEICMgC2oiJCgCADYCACAEQQRqICRBBGooAgA2AgAgBEEIaiAkQQhqKAIANgIAIARBDGogJEEMaigCADYCACALQRBqIQsgDiAiQQRqIiJHDQALCyAPRQ0AIAcgIkECdCILaiAhIAtqKAIANgIACwJAIAFFDQBBACElIBwhIyAGISYDQCAFISQgACEiAkACQCAADQAgGyAXKQMANwMAIBsgFikDADcDCCAbIBUpAwA3AxAgGyAUKQMANwMYIBsgEykDADcDICAbIBIpAwA3AyggGyARKQMANwMwIBsgECkDADcDOAwBCwNAICQgJmoiCyAkIAxqIgQpAwA3AwAgC0EIaiAEQQhqKQMANwMAIAtBEGogBEEQaikDADcDACALQRhqIARBGGopAwA3AwAgC0EgaiAEQSBqKQMANwMAIAtBKGogBEEoaikDADcDACALQTBqIARBMGopAwA3AwAgC0E4aiAEQThqKQMANwMAIAtBwABqIARBwABqKQMANwMAIAtByABqIARByABqKQMANwMAIAtB0ABqIARB0ABqKQMANwMAIAtB2ABqIARB2ABqKQMANwMAIAtB4ABqIARB4ABqKQMANwMAIAtB6ABqIARB6ABqKQMANwMAIAtB8ABqIARB8ABqKQMANwMAIAtB+ABqIARB+ABqKQMANwMAICRBgAFqISQgIkF/aiIiDQALIAcgCCAbIAAQAiAFISQgACEiA0AgJCAjaiILICQgDWoiBCkDADcDACALQQhqIARBCGopAwA3AwAgC0EQaiAEQRBqKQMANwMAIAtBGGogBEEYaikDADcDACALQSBqIARBIGopAwA3AwAgC0EoaiAEQShqKQMANwMAIAtBMGogBEEwaikDADcDACALQThqIARBOGopAwA3AwAgC0HAAGogBEHAAGopAwA3AwAgC0HIAGogBEHIAGopAwA3AwAgC0HQAGogBEHQAGopAwA3AwAgC0HYAGogBEHYAGopAwA3AwAgC0HgAGogBEHgAGopAwA3AwAgC0HoAGogBEHoAGopAwA3AwAgC0HwAGogBEHwAGopAwA3AwAgC0H4AGogBEH4AGopAwA3AwAgJEGAAWohJCAiQX9qIiINAAsLIAggByAbIAAQAiAjIBpqISMgJiAaaiEmICVBAmoiJSABSQ0AC0EAISUDQAJAAkAgAA0AIBsgFykDADcDACAbIBYpAwA3AwggGyAVKQMANwMQIBsgFCkDADcDGCAbIBMpAwA3AyAgGyASKQMANwMoIBsgESkDADcDMCAbIBApAwA3AzgMAQsgACAKIBkpAgAgGIOnQQd0amwhJiAFISQgACEiA0AgJCAMaiILIAspAwAgJCAmaiIEKQMAhTcDACALQQhqIiMgIykDACAEQQhqKQMAhTcDACALQRBqIiMgIykDACAEQRBqKQMAhTcDACALQRhqIiMgIykDACAEQRhqKQMAhTcDACALQSBqIiMgIykDACAEQSBqKQMAhTcDACALQShqIiMgIykDACAEQShqKQMAhTcDACALQTBqIiMgIykDACAEQTBqKQMAhTcDACALQThqIiMgIykDACAEQThqKQMAhTcDACALQcAAaiIjICMpAwAgBEHAAGopAwCFNwMAIAtByABqIiMgIykDACAEQcgAaikDAIU3AwAgC0HQAGoiIyAjKQMAIARB0ABqKQMAhTcDACALQdgAaiIjICMpAwAgBEHYAGopAwCFNwMAIAtB4ABqIiMgIykDACAEQeAAaikDAIU3AwAgC0HoAGoiIyAjKQMAIARB6ABqKQMAhTcDACALQfAAaiIjICMpAwAgBEHwAGopAwCFNwMAIAtB+ABqIgsgCykDACAEQfgAaikDAIU3AwAgJEGAAWohJCAiQX9qIiINAAsgByAIIBsgABACIAAgCiAJKQIAIBiDp0EHdGpsISYgBSEkIAAhIgNAICQgDWoiCyALKQMAICQgJmoiBCkDAIU3AwAgC0EIaiIjICMpAwAgBEEIaikDAIU3AwAgC0EQaiIjICMpAwAgBEEQaikDAIU3AwAgC0EYaiIjICMpAwAgBEEYaikDAIU3AwAgC0EgaiIjICMpAwAgBEEgaikDAIU3AwAgC0EoaiIjICMpAwAgBEEoaikDAIU3AwAgC0EwaiIjICMpAwAgBEEwaikDAIU3AwAgC0E4aiIjICMpAwAgBEE4aikDAIU3AwAgC0HAAGoiIyAjKQMAIARBwABqKQMAhTcDACALQcgAaiIjICMpAwAgBEHIAGopAwCFNwMAIAtB0ABqIiMgIykDACAEQdAAaikDAIU3AwAgC0HYAGoiIyAjKQMAIARB2ABqKQMAhTcDACALQeAAaiIjICMpAwAgBEHgAGopAwCFNwMAIAtB6ABqIiMgIykDACAEQegAaikDAIU3AwAgC0HwAGoiIyAjKQMAIARB8ABqKQMAhTcDACALQfgAaiILIAspAwAgBEH4AGopAwCFNwMAICRBgAFqISQgIkF/aiIiDQALCyAIIAcgGyAAEAIgJUECaiIlIAFJDQALCwJAIABFDQBBACEiAkAgHQ0AICAgHmohI0EAIQtBACEiA0AgIyALaiIEIAcgC2oiJCgCADYCACAEQQRqICRBBGooAgA2AgAgBEEIaiAkQQhqKAIANgIAIARBDGogJEEMaigCADYCACALQRBqIQsgDiAiQQRqIiJHDQALCyAPRQ0AICEgIkECdCILaiAHIAtqKAIANgIACyAeIANqIR4gH0EBaiIfIAJHDQALCws=";
      var hash$3 = "b32721f8";
      var wasmJson$3 = {
        name: name$3,
        data: data$3,
        hash: hash$3
      };
      function scryptInternal(options) {
        return __awaiter(this, void 0, void 0, function* () {
          const { costFactor, blockSize, parallelism, hashLength } = options;
          const SHA256Hasher = createSHA256();
          const blockData = yield pbkdf2({
            password: options.password,
            salt: options.salt,
            iterations: 1,
            hashLength: 128 * blockSize * parallelism,
            hashFunction: SHA256Hasher,
            outputType: "binary"
          });
          const scryptInterface = yield WASMInterface(wasmJson$3, 0);
          const VSize = 128 * blockSize * costFactor;
          const XYSize = 256 * blockSize;
          scryptInterface.setMemorySize(blockData.length + VSize + XYSize);
          scryptInterface.writeMemory(blockData, 0);
          scryptInterface.getExports().scrypt(blockSize, costFactor, parallelism);
          const expensiveSalt = scryptInterface.getMemory().subarray(0, 128 * blockSize * parallelism);
          const outputData = yield pbkdf2({
            password: options.password,
            salt: expensiveSalt,
            iterations: 1,
            hashLength,
            hashFunction: SHA256Hasher,
            outputType: "binary"
          });
          if (options.outputType === "hex") {
            const digestChars = new Uint8Array(hashLength * 2);
            return getDigestHex(digestChars, outputData, hashLength);
          }
          return outputData;
        });
      }
      const isPowerOfTwo = (v) => v && !(v & v - 1);
      const validateOptions$1 = (options) => {
        if (!options || typeof options !== "object") {
          throw new Error("Invalid options parameter. It requires an object.");
        }
        if (!Number.isInteger(options.blockSize) || options.blockSize < 1) {
          throw new Error("Block size should be a positive number");
        }
        if (!Number.isInteger(options.costFactor) || options.costFactor < 2 || !isPowerOfTwo(options.costFactor)) {
          throw new Error("Cost factor should be a power of 2, greater than 1");
        }
        if (!Number.isInteger(options.parallelism) || options.parallelism < 1) {
          throw new Error("Parallelism should be a positive number");
        }
        if (!Number.isInteger(options.hashLength) || options.hashLength < 1) {
          throw new Error("Hash length should be a positive number.");
        }
        if (options.outputType === void 0) {
          options.outputType = "hex";
        }
        if (!["hex", "binary"].includes(options.outputType)) {
          throw new Error(`Insupported output type ${options.outputType}. Valid values: ['hex', 'binary']`);
        }
      };
      function scrypt(options) {
        return __awaiter(this, void 0, void 0, function* () {
          validateOptions$1(options);
          return scryptInternal(options);
        });
      }
      var name$2 = "bcrypt";
      var data$2 = "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";
      var hash$2 = "8bd8822d";
      var wasmJson$2 = {
        name: name$2,
        data: data$2,
        hash: hash$2
      };
      function bcryptInternal(options) {
        return __awaiter(this, void 0, void 0, function* () {
          const { costFactor, password, salt } = options;
          const bcryptInterface = yield WASMInterface(wasmJson$2, 0);
          bcryptInterface.writeMemory(getUInt8Buffer(salt), 0);
          const passwordBuffer = getUInt8Buffer(password);
          bcryptInterface.writeMemory(passwordBuffer, 16);
          const shouldEncode = options.outputType === "encoded" ? 1 : 0;
          bcryptInterface.getExports().bcrypt(passwordBuffer.length, costFactor, shouldEncode);
          const memory = bcryptInterface.getMemory();
          if (options.outputType === "encoded") {
            return intArrayToString(memory, 60);
          }
          if (options.outputType === "hex") {
            const digestChars = new Uint8Array(24 * 2);
            return getDigestHex(digestChars, memory, 24);
          }
          return memory.slice(0, 24);
        });
      }
      const validateOptions = (options) => {
        if (!options || typeof options !== "object") {
          throw new Error("Invalid options parameter. It requires an object.");
        }
        if (!Number.isInteger(options.costFactor) || options.costFactor < 4 || options.costFactor > 31) {
          throw new Error("Cost factor should be a number between 4 and 31");
        }
        options.password = getUInt8Buffer(options.password);
        if (options.password.length < 1) {
          throw new Error("Password should be at least 1 byte long");
        }
        if (options.password.length > 72) {
          throw new Error("Password should be at most 72 bytes long");
        }
        options.salt = getUInt8Buffer(options.salt);
        if (options.salt.length !== 16) {
          throw new Error("Salt should be 16 bytes long");
        }
        if (options.outputType === void 0) {
          options.outputType = "encoded";
        }
        if (!["hex", "binary", "encoded"].includes(options.outputType)) {
          throw new Error(`Insupported output type ${options.outputType}. Valid values: ['hex', 'binary', 'encoded']`);
        }
      };
      function bcrypt(options) {
        return __awaiter(this, void 0, void 0, function* () {
          validateOptions(options);
          return bcryptInternal(options);
        });
      }
      const validateHashCharacters = (hash2) => {
        if (!/^\$2[axyb]\$[0-3][0-9]\$[./A-Za-z0-9]{53}$/.test(hash2)) {
          return false;
        }
        if (hash2[4] === "0" && Number(hash2[5]) < 4) {
          return false;
        }
        if (hash2[4] === "3" && Number(hash2[5]) > 1) {
          return false;
        }
        return true;
      };
      const validateVerifyOptions = (options) => {
        if (!options || typeof options !== "object") {
          throw new Error("Invalid options parameter. It requires an object.");
        }
        if (options.hash === void 0 || typeof options.hash !== "string") {
          throw new Error("Hash should be specified");
        }
        if (options.hash.length !== 60) {
          throw new Error("Hash should be 60 bytes long");
        }
        if (!validateHashCharacters(options.hash)) {
          throw new Error("Invalid hash");
        }
        options.password = getUInt8Buffer(options.password);
        if (options.password.length < 1) {
          throw new Error("Password should be at least 1 byte long");
        }
        if (options.password.length > 72) {
          throw new Error("Password should be at most 72 bytes long");
        }
      };
      function bcryptVerify(options) {
        return __awaiter(this, void 0, void 0, function* () {
          validateVerifyOptions(options);
          const { hash: hash2, password } = options;
          const bcryptInterface = yield WASMInterface(wasmJson$2, 0);
          bcryptInterface.writeMemory(getUInt8Buffer(hash2), 0);
          const passwordBuffer = getUInt8Buffer(password);
          bcryptInterface.writeMemory(passwordBuffer, 60);
          return !!bcryptInterface.getExports().bcrypt_verify(passwordBuffer.length);
        });
      }
      var name$1 = "whirlpool";
      var data$1 = "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";
      var hash$1 = "8d8f6035";
      var wasmJson$1 = {
        name: name$1,
        data: data$1,
        hash: hash$1
      };
      const mutex$1 = new Mutex();
      let wasmCache$1 = null;
      function whirlpool(data2) {
        if (wasmCache$1 === null) {
          return lockedCreate(mutex$1, wasmJson$1, 64).then((wasm) => {
            wasmCache$1 = wasm;
            return wasmCache$1.calculate(data2);
          });
        }
        try {
          const hash2 = wasmCache$1.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createWhirlpool() {
        return WASMInterface(wasmJson$1, 64).then((wasm) => {
          wasm.init();
          const obj = {
            init: () => {
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: 64
          };
          return obj;
        });
      }
      var name = "sm3";
      var data = "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";
      var hash = "b6fb4b8e";
      var wasmJson = {
        name,
        data,
        hash
      };
      const mutex = new Mutex();
      let wasmCache = null;
      function sm3(data2) {
        if (wasmCache === null) {
          return lockedCreate(mutex, wasmJson, 32).then((wasm) => {
            wasmCache = wasm;
            return wasmCache.calculate(data2);
          });
        }
        try {
          const hash2 = wasmCache.calculate(data2);
          return Promise.resolve(hash2);
        } catch (err) {
          return Promise.reject(err);
        }
      }
      function createSM3() {
        return WASMInterface(wasmJson, 32).then((wasm) => {
          wasm.init();
          const obj = {
            init: () => {
              wasm.init();
              return obj;
            },
            update: (data2) => {
              wasm.update(data2);
              return obj;
            },
            // biome-ignore lint/suspicious/noExplicitAny: Conflict with IHasher type
            digest: (outputType) => wasm.digest(outputType),
            save: () => wasm.save(),
            load: (data2) => {
              wasm.load(data2);
              return obj;
            },
            blockSize: 64,
            digestSize: 32
          };
          return obj;
        });
      }
      exports3.adler32 = adler32;
      exports3.argon2Verify = argon2Verify;
      exports3.argon2d = argon2d;
      exports3.argon2i = argon2i;
      exports3.argon2id = argon2id2;
      exports3.bcrypt = bcrypt;
      exports3.bcryptVerify = bcryptVerify;
      exports3.blake2b = blake2b;
      exports3.blake2s = blake2s;
      exports3.blake3 = blake3;
      exports3.crc32 = crc32;
      exports3.crc64 = crc64;
      exports3.createAdler32 = createAdler32;
      exports3.createBLAKE2b = createBLAKE2b;
      exports3.createBLAKE2s = createBLAKE2s;
      exports3.createBLAKE3 = createBLAKE3;
      exports3.createCRC32 = createCRC32;
      exports3.createCRC64 = createCRC64;
      exports3.createHMAC = createHMAC;
      exports3.createKeccak = createKeccak;
      exports3.createMD4 = createMD4;
      exports3.createMD5 = createMD5;
      exports3.createRIPEMD160 = createRIPEMD160;
      exports3.createSHA1 = createSHA1;
      exports3.createSHA224 = createSHA224;
      exports3.createSHA256 = createSHA256;
      exports3.createSHA3 = createSHA3;
      exports3.createSHA384 = createSHA384;
      exports3.createSHA512 = createSHA512;
      exports3.createSM3 = createSM3;
      exports3.createWhirlpool = createWhirlpool;
      exports3.createXXHash128 = createXXHash128;
      exports3.createXXHash3 = createXXHash3;
      exports3.createXXHash32 = createXXHash32;
      exports3.createXXHash64 = createXXHash64;
      exports3.keccak = keccak;
      exports3.md4 = md4;
      exports3.md5 = md52;
      exports3.pbkdf2 = pbkdf2;
      exports3.ripemd160 = ripemd160;
      exports3.scrypt = scrypt;
      exports3.sha1 = sha1;
      exports3.sha224 = sha224;
      exports3.sha256 = sha256;
      exports3.sha3 = sha3;
      exports3.sha384 = sha384;
      exports3.sha512 = sha512;
      exports3.sm3 = sm3;
      exports3.whirlpool = whirlpool;
      exports3.xxhash128 = xxhash128;
      exports3.xxhash3 = xxhash3;
      exports3.xxhash32 = xxhash32;
      exports3.xxhash64 = xxhash64;
    });
  }
});

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// node_modules/axios/lib/helpers/bind.js
function bind(fn, thisArg) {
  return function wrap() {
    return fn.apply(thisArg, arguments);
  };
}

// node_modules/axios/lib/utils.js
var { toString } = Object.prototype;
var { getPrototypeOf } = Object;
var { iterator, toStringTag } = Symbol;
var kindOf = /* @__PURE__ */ ((cache) => (thing) => {
  const str = toString.call(thing);
  return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null));
var kindOfTest = (type) => {
  type = type.toLowerCase();
  return (thing) => kindOf(thing) === type;
};
var typeOfTest = (type) => (thing) => typeof thing === type;
var { isArray } = Array;
var isUndefined = typeOfTest("undefined");
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction(val.constructor.isBuffer) && val.constructor.isBuffer(val);
}
var isArrayBuffer = kindOfTest("ArrayBuffer");
function isArrayBufferView(val) {
  let result;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
    result = ArrayBuffer.isView(val);
  } else {
    result = val && val.buffer && isArrayBuffer(val.buffer);
  }
  return result;
}
var isString = typeOfTest("string");
var isFunction = typeOfTest("function");
var isNumber = typeOfTest("number");
var isObject = (thing) => thing !== null && typeof thing === "object";
var isBoolean = (thing) => thing === true || thing === false;
var isPlainObject = (val) => {
  if (kindOf(val) !== "object") {
    return false;
  }
  const prototype2 = getPrototypeOf(val);
  return (prototype2 === null || prototype2 === Object.prototype || Object.getPrototypeOf(prototype2) === null) && !(toStringTag in val) && !(iterator in val);
};
var isEmptyObject = (val) => {
  if (!isObject(val) || isBuffer(val)) {
    return false;
  }
  try {
    return Object.keys(val).length === 0 && Object.getPrototypeOf(val) === Object.prototype;
  } catch (e) {
    return false;
  }
};
var isDate = kindOfTest("Date");
var isFile = kindOfTest("File");
var isReactNativeBlob = (value) => {
  return !!(value && typeof value.uri !== "undefined");
};
var isReactNative = (formData) => formData && typeof formData.getParts !== "undefined";
var isBlob = kindOfTest("Blob");
var isFileList = kindOfTest("FileList");
var isStream = (val) => isObject(val) && isFunction(val.pipe);
function getGlobal() {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  return {};
}
var G = getGlobal();
var FormDataCtor = typeof G.FormData !== "undefined" ? G.FormData : void 0;
var isFormData = (thing) => {
  let kind;
  return thing && (FormDataCtor && thing instanceof FormDataCtor || isFunction(thing.append) && ((kind = kindOf(thing)) === "formdata" || // detect form-data instance
  kind === "object" && isFunction(thing.toString) && thing.toString() === "[object FormData]"));
};
var isURLSearchParams = kindOfTest("URLSearchParams");
var [isReadableStream, isRequest, isResponse, isHeaders] = [
  "ReadableStream",
  "Request",
  "Response",
  "Headers"
].map(kindOfTest);
var trim = (str) => {
  return str.trim ? str.trim() : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
};
function forEach(obj, fn, { allOwnKeys = false } = {}) {
  if (obj === null || typeof obj === "undefined") {
    return;
  }
  let i;
  let l;
  if (typeof obj !== "object") {
    obj = [obj];
  }
  if (isArray(obj)) {
    for (i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    if (isBuffer(obj)) {
      return;
    }
    const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
    const len = keys.length;
    let key;
    for (i = 0; i < len; i++) {
      key = keys[i];
      fn.call(null, obj[key], key, obj);
    }
  }
}
function findKey(obj, key) {
  if (isBuffer(obj)) {
    return null;
  }
  key = key.toLowerCase();
  const keys = Object.keys(obj);
  let i = keys.length;
  let _key;
  while (i-- > 0) {
    _key = keys[i];
    if (key === _key.toLowerCase()) {
      return _key;
    }
  }
  return null;
}
var _global = (() => {
  if (typeof globalThis !== "undefined") return globalThis;
  return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : global;
})();
var isContextDefined = (context) => !isUndefined(context) && context !== _global;
function merge() {
  const { caseless, skipUndefined } = isContextDefined(this) && this || {};
  const result = {};
  const assignValue = (val, key) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return;
    }
    const targetKey = caseless && findKey(result, key) || key;
    if (isPlainObject(result[targetKey]) && isPlainObject(val)) {
      result[targetKey] = merge(result[targetKey], val);
    } else if (isPlainObject(val)) {
      result[targetKey] = merge({}, val);
    } else if (isArray(val)) {
      result[targetKey] = val.slice();
    } else if (!skipUndefined || !isUndefined(val)) {
      result[targetKey] = val;
    }
  };
  for (let i = 0, l = arguments.length; i < l; i++) {
    arguments[i] && forEach(arguments[i], assignValue);
  }
  return result;
}
var extend = (a, b, thisArg, { allOwnKeys } = {}) => {
  forEach(
    b,
    (val, key) => {
      if (thisArg && isFunction(val)) {
        Object.defineProperty(a, key, {
          value: bind(val, thisArg),
          writable: true,
          enumerable: true,
          configurable: true
        });
      } else {
        Object.defineProperty(a, key, {
          value: val,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    },
    { allOwnKeys }
  );
  return a;
};
var stripBOM = (content) => {
  if (content.charCodeAt(0) === 65279) {
    content = content.slice(1);
  }
  return content;
};
var inherits = (constructor, superConstructor, props, descriptors) => {
  constructor.prototype = Object.create(superConstructor.prototype, descriptors);
  Object.defineProperty(constructor.prototype, "constructor", {
    value: constructor,
    writable: true,
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(constructor, "super", {
    value: superConstructor.prototype
  });
  props && Object.assign(constructor.prototype, props);
};
var toFlatObject = (sourceObj, destObj, filter2, propFilter) => {
  let props;
  let i;
  let prop;
  const merged = {};
  destObj = destObj || {};
  if (sourceObj == null) return destObj;
  do {
    props = Object.getOwnPropertyNames(sourceObj);
    i = props.length;
    while (i-- > 0) {
      prop = props[i];
      if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
        destObj[prop] = sourceObj[prop];
        merged[prop] = true;
      }
    }
    sourceObj = filter2 !== false && getPrototypeOf(sourceObj);
  } while (sourceObj && (!filter2 || filter2(sourceObj, destObj)) && sourceObj !== Object.prototype);
  return destObj;
};
var endsWith = (str, searchString, position) => {
  str = String(str);
  if (position === void 0 || position > str.length) {
    position = str.length;
  }
  position -= searchString.length;
  const lastIndex = str.indexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
};
var toArray = (thing) => {
  if (!thing) return null;
  if (isArray(thing)) return thing;
  let i = thing.length;
  if (!isNumber(i)) return null;
  const arr = new Array(i);
  while (i-- > 0) {
    arr[i] = thing[i];
  }
  return arr;
};
var isTypedArray = /* @__PURE__ */ ((TypedArray) => {
  return (thing) => {
    return TypedArray && thing instanceof TypedArray;
  };
})(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
var forEachEntry = (obj, fn) => {
  const generator = obj && obj[iterator];
  const _iterator = generator.call(obj);
  let result;
  while ((result = _iterator.next()) && !result.done) {
    const pair = result.value;
    fn.call(obj, pair[0], pair[1]);
  }
};
var matchAll = (regExp, str) => {
  let matches;
  const arr = [];
  while ((matches = regExp.exec(str)) !== null) {
    arr.push(matches);
  }
  return arr;
};
var isHTMLForm = kindOfTest("HTMLFormElement");
var toCamelCase = (str) => {
  return str.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function replacer(m, p1, p2) {
    return p1.toUpperCase() + p2;
  });
};
var hasOwnProperty = (({ hasOwnProperty: hasOwnProperty2 }) => (obj, prop) => hasOwnProperty2.call(obj, prop))(Object.prototype);
var isRegExp = kindOfTest("RegExp");
var reduceDescriptors = (obj, reducer) => {
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  const reducedDescriptors = {};
  forEach(descriptors, (descriptor, name) => {
    let ret;
    if ((ret = reducer(descriptor, name, obj)) !== false) {
      reducedDescriptors[name] = ret || descriptor;
    }
  });
  Object.defineProperties(obj, reducedDescriptors);
};
var freezeMethods = (obj) => {
  reduceDescriptors(obj, (descriptor, name) => {
    if (isFunction(obj) && ["arguments", "caller", "callee"].indexOf(name) !== -1) {
      return false;
    }
    const value = obj[name];
    if (!isFunction(value)) return;
    descriptor.enumerable = false;
    if ("writable" in descriptor) {
      descriptor.writable = false;
      return;
    }
    if (!descriptor.set) {
      descriptor.set = () => {
        throw Error("Can not rewrite read-only method '" + name + "'");
      };
    }
  });
};
var toObjectSet = (arrayOrString, delimiter) => {
  const obj = {};
  const define2 = (arr) => {
    arr.forEach((value) => {
      obj[value] = true;
    });
  };
  isArray(arrayOrString) ? define2(arrayOrString) : define2(String(arrayOrString).split(delimiter));
  return obj;
};
var noop = () => {
};
var toFiniteNumber = (value, defaultValue) => {
  return value != null && Number.isFinite(value = +value) ? value : defaultValue;
};
function isSpecCompliantForm(thing) {
  return !!(thing && isFunction(thing.append) && thing[toStringTag] === "FormData" && thing[iterator]);
}
var toJSONObject = (obj) => {
  const stack = new Array(10);
  const visit = (source, i) => {
    if (isObject(source)) {
      if (stack.indexOf(source) >= 0) {
        return;
      }
      if (isBuffer(source)) {
        return source;
      }
      if (!("toJSON" in source)) {
        stack[i] = source;
        const target = isArray(source) ? [] : {};
        forEach(source, (value, key) => {
          const reducedValue = visit(value, i + 1);
          !isUndefined(reducedValue) && (target[key] = reducedValue);
        });
        stack[i] = void 0;
        return target;
      }
    }
    return source;
  };
  return visit(obj, 0);
};
var isAsyncFn = kindOfTest("AsyncFunction");
var isThenable = (thing) => thing && (isObject(thing) || isFunction(thing)) && isFunction(thing.then) && isFunction(thing.catch);
var _setImmediate = ((setImmediateSupported, postMessageSupported) => {
  if (setImmediateSupported) {
    return setImmediate;
  }
  return postMessageSupported ? ((token, callbacks) => {
    _global.addEventListener(
      "message",
      ({ source, data }) => {
        if (source === _global && data === token) {
          callbacks.length && callbacks.shift()();
        }
      },
      false
    );
    return (cb) => {
      callbacks.push(cb);
      _global.postMessage(token, "*");
    };
  })(`axios@${Math.random()}`, []) : (cb) => setTimeout(cb);
})(typeof setImmediate === "function", isFunction(_global.postMessage));
var asap = typeof queueMicrotask !== "undefined" ? queueMicrotask.bind(_global) : typeof process !== "undefined" && process.nextTick || _setImmediate;
var isIterable = (thing) => thing != null && isFunction(thing[iterator]);
var utils_default = {
  isArray,
  isArrayBuffer,
  isBuffer,
  isFormData,
  isArrayBufferView,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isPlainObject,
  isEmptyObject,
  isReadableStream,
  isRequest,
  isResponse,
  isHeaders,
  isUndefined,
  isDate,
  isFile,
  isReactNativeBlob,
  isReactNative,
  isBlob,
  isRegExp,
  isFunction,
  isStream,
  isURLSearchParams,
  isTypedArray,
  isFileList,
  forEach,
  merge,
  extend,
  trim,
  stripBOM,
  inherits,
  toFlatObject,
  kindOf,
  kindOfTest,
  endsWith,
  toArray,
  forEachEntry,
  matchAll,
  isHTMLForm,
  hasOwnProperty,
  hasOwnProp: hasOwnProperty,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors,
  freezeMethods,
  toObjectSet,
  toCamelCase,
  noop,
  toFiniteNumber,
  findKey,
  global: _global,
  isContextDefined,
  isSpecCompliantForm,
  toJSONObject,
  isAsyncFn,
  isThenable,
  setImmediate: _setImmediate,
  asap,
  isIterable
};

// node_modules/axios/lib/core/AxiosError.js
var AxiosError = class _AxiosError extends Error {
  static from(error, code, config, request, response, customProps) {
    const axiosError = new _AxiosError(error.message, code || error.code, config, request, response);
    axiosError.cause = error;
    axiosError.name = error.name;
    if (error.status != null && axiosError.status == null) {
      axiosError.status = error.status;
    }
    customProps && Object.assign(axiosError, customProps);
    return axiosError;
  }
  /**
   * Create an Error with the specified message, config, error code, request and response.
   *
   * @param {string} message The error message.
   * @param {string} [code] The error code (for example, 'ECONNABORTED').
   * @param {Object} [config] The config.
   * @param {Object} [request] The request.
   * @param {Object} [response] The response.
   *
   * @returns {Error} The created error.
   */
  constructor(message, code, config, request, response) {
    super(message);
    Object.defineProperty(this, "message", {
      value: message,
      enumerable: true,
      writable: true,
      configurable: true
    });
    this.name = "AxiosError";
    this.isAxiosError = true;
    code && (this.code = code);
    config && (this.config = config);
    request && (this.request = request);
    if (response) {
      this.response = response;
      this.status = response.status;
    }
  }
  toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: utils_default.toJSONObject(this.config),
      code: this.code,
      status: this.status
    };
  }
};
AxiosError.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
AxiosError.ERR_BAD_OPTION = "ERR_BAD_OPTION";
AxiosError.ECONNABORTED = "ECONNABORTED";
AxiosError.ETIMEDOUT = "ETIMEDOUT";
AxiosError.ERR_NETWORK = "ERR_NETWORK";
AxiosError.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
AxiosError.ERR_DEPRECATED = "ERR_DEPRECATED";
AxiosError.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
AxiosError.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
AxiosError.ERR_CANCELED = "ERR_CANCELED";
AxiosError.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
AxiosError.ERR_INVALID_URL = "ERR_INVALID_URL";
var AxiosError_default = AxiosError;

// node_modules/axios/lib/platform/node/classes/FormData.js
var import_form_data = __toESM(require_form_data(), 1);
var FormData_default = import_form_data.default;

// node_modules/axios/lib/helpers/toFormData.js
function isVisitable(thing) {
  return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
}
function removeBrackets(key) {
  return utils_default.endsWith(key, "[]") ? key.slice(0, -2) : key;
}
function renderKey(path, key, dots) {
  if (!path) return key;
  return path.concat(key).map(function each(token, i) {
    token = removeBrackets(token);
    return !dots && i ? "[" + token + "]" : token;
  }).join(dots ? "." : "");
}
function isFlatArray(arr) {
  return utils_default.isArray(arr) && !arr.some(isVisitable);
}
var predicates = utils_default.toFlatObject(utils_default, {}, null, function filter(prop) {
  return /^is[A-Z]/.test(prop);
});
function toFormData(obj, formData, options) {
  if (!utils_default.isObject(obj)) {
    throw new TypeError("target must be an object");
  }
  formData = formData || new (FormData_default || FormData)();
  options = utils_default.toFlatObject(
    options,
    {
      metaTokens: true,
      dots: false,
      indexes: false
    },
    false,
    function defined(option, source) {
      return !utils_default.isUndefined(source[option]);
    }
  );
  const metaTokens = options.metaTokens;
  const visitor = options.visitor || defaultVisitor;
  const dots = options.dots;
  const indexes = options.indexes;
  const _Blob = options.Blob || typeof Blob !== "undefined" && Blob;
  const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
  if (!utils_default.isFunction(visitor)) {
    throw new TypeError("visitor must be a function");
  }
  function convertValue(value) {
    if (value === null) return "";
    if (utils_default.isDate(value)) {
      return value.toISOString();
    }
    if (utils_default.isBoolean(value)) {
      return value.toString();
    }
    if (!useBlob && utils_default.isBlob(value)) {
      throw new AxiosError_default("Blob is not supported. Use a Buffer instead.");
    }
    if (utils_default.isArrayBuffer(value) || utils_default.isTypedArray(value)) {
      return useBlob && typeof Blob === "function" ? new Blob([value]) : Buffer.from(value);
    }
    return value;
  }
  function defaultVisitor(value, key, path) {
    let arr = value;
    if (utils_default.isReactNative(formData) && utils_default.isReactNativeBlob(value)) {
      formData.append(renderKey(path, key, dots), convertValue(value));
      return false;
    }
    if (value && !path && typeof value === "object") {
      if (utils_default.endsWith(key, "{}")) {
        key = metaTokens ? key : key.slice(0, -2);
        value = JSON.stringify(value);
      } else if (utils_default.isArray(value) && isFlatArray(value) || (utils_default.isFileList(value) || utils_default.endsWith(key, "[]")) && (arr = utils_default.toArray(value))) {
        key = removeBrackets(key);
        arr.forEach(function each(el, index) {
          !(utils_default.isUndefined(el) || el === null) && formData.append(
            // eslint-disable-next-line no-nested-ternary
            indexes === true ? renderKey([key], index, dots) : indexes === null ? key : key + "[]",
            convertValue(el)
          );
        });
        return false;
      }
    }
    if (isVisitable(value)) {
      return true;
    }
    formData.append(renderKey(path, key, dots), convertValue(value));
    return false;
  }
  const stack = [];
  const exposedHelpers = Object.assign(predicates, {
    defaultVisitor,
    convertValue,
    isVisitable
  });
  function build(value, path) {
    if (utils_default.isUndefined(value)) return;
    if (stack.indexOf(value) !== -1) {
      throw Error("Circular reference detected in " + path.join("."));
    }
    stack.push(value);
    utils_default.forEach(value, function each(el, key) {
      const result = !(utils_default.isUndefined(el) || el === null) && visitor.call(formData, el, utils_default.isString(key) ? key.trim() : key, path, exposedHelpers);
      if (result === true) {
        build(el, path ? path.concat(key) : [key]);
      }
    });
    stack.pop();
  }
  if (!utils_default.isObject(obj)) {
    throw new TypeError("data must be an object");
  }
  build(obj);
  return formData;
}
var toFormData_default = toFormData;

// node_modules/axios/lib/helpers/AxiosURLSearchParams.js
function encode(str) {
  const charMap = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+",
    "%00": "\0"
  };
  return encodeURIComponent(str).replace(/[!'()~]|%20|%00/g, function replacer(match) {
    return charMap[match];
  });
}
function AxiosURLSearchParams(params, options) {
  this._pairs = [];
  params && toFormData_default(params, this, options);
}
var prototype = AxiosURLSearchParams.prototype;
prototype.append = function append(name, value) {
  this._pairs.push([name, value]);
};
prototype.toString = function toString2(encoder) {
  const _encode = encoder ? function(value) {
    return encoder.call(this, value, encode);
  } : encode;
  return this._pairs.map(function each(pair) {
    return _encode(pair[0]) + "=" + _encode(pair[1]);
  }, "").join("&");
};
var AxiosURLSearchParams_default = AxiosURLSearchParams;

// node_modules/axios/lib/helpers/buildURL.js
function encode2(val) {
  return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
function buildURL(url2, params, options) {
  if (!params) {
    return url2;
  }
  const _encode = options && options.encode || encode2;
  const _options = utils_default.isFunction(options) ? {
    serialize: options
  } : options;
  const serializeFn = _options && _options.serialize;
  let serializedParams;
  if (serializeFn) {
    serializedParams = serializeFn(params, _options);
  } else {
    serializedParams = utils_default.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams_default(params, _options).toString(_encode);
  }
  if (serializedParams) {
    const hashmarkIndex = url2.indexOf("#");
    if (hashmarkIndex !== -1) {
      url2 = url2.slice(0, hashmarkIndex);
    }
    url2 += (url2.indexOf("?") === -1 ? "?" : "&") + serializedParams;
  }
  return url2;
}

// node_modules/axios/lib/core/InterceptorManager.js
var InterceptorManager = class {
  constructor() {
    this.handlers = [];
  }
  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   * @param {Object} options The options for the interceptor, synchronous and runWhen
   *
   * @return {Number} An ID used to remove interceptor later
   */
  use(fulfilled, rejected, options) {
    this.handlers.push({
      fulfilled,
      rejected,
      synchronous: options ? options.synchronous : false,
      runWhen: options ? options.runWhen : null
    });
    return this.handlers.length - 1;
  }
  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   *
   * @returns {void}
   */
  eject(id) {
    if (this.handlers[id]) {
      this.handlers[id] = null;
    }
  }
  /**
   * Clear all interceptors from the stack
   *
   * @returns {void}
   */
  clear() {
    if (this.handlers) {
      this.handlers = [];
    }
  }
  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   *
   * @returns {void}
   */
  forEach(fn) {
    utils_default.forEach(this.handlers, function forEachHandler(h) {
      if (h !== null) {
        fn(h);
      }
    });
  }
};
var InterceptorManager_default = InterceptorManager;

// node_modules/axios/lib/defaults/transitional.js
var transitional_default = {
  silentJSONParsing: true,
  forcedJSONParsing: true,
  clarifyTimeoutError: false,
  legacyInterceptorReqResOrdering: true
};

// node_modules/axios/lib/platform/node/index.js
var import_crypto = __toESM(require("crypto"), 1);

// node_modules/axios/lib/platform/node/classes/URLSearchParams.js
var import_url = __toESM(require("url"), 1);
var URLSearchParams_default = import_url.default.URLSearchParams;

// node_modules/axios/lib/platform/node/index.js
var ALPHA = "abcdefghijklmnopqrstuvwxyz";
var DIGIT = "0123456789";
var ALPHABET = {
  DIGIT,
  ALPHA,
  ALPHA_DIGIT: ALPHA + ALPHA.toUpperCase() + DIGIT
};
var generateString = (size = 16, alphabet = ALPHABET.ALPHA_DIGIT) => {
  let str = "";
  const { length } = alphabet;
  const randomValues = new Uint32Array(size);
  import_crypto.default.randomFillSync(randomValues);
  for (let i = 0; i < size; i++) {
    str += alphabet[randomValues[i] % length];
  }
  return str;
};
var node_default = {
  isNode: true,
  classes: {
    URLSearchParams: URLSearchParams_default,
    FormData: FormData_default,
    Blob: typeof Blob !== "undefined" && Blob || null
  },
  ALPHABET,
  generateString,
  protocols: ["http", "https", "file", "data"]
};

// node_modules/axios/lib/platform/common/utils.js
var utils_exports = {};
__export(utils_exports, {
  hasBrowserEnv: () => hasBrowserEnv,
  hasStandardBrowserEnv: () => hasStandardBrowserEnv,
  hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv,
  navigator: () => _navigator,
  origin: () => origin
});
var hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
var _navigator = typeof navigator === "object" && navigator || void 0;
var hasStandardBrowserEnv = hasBrowserEnv && (!_navigator || ["ReactNative", "NativeScript", "NS"].indexOf(_navigator.product) < 0);
var hasStandardBrowserWebWorkerEnv = (() => {
  return typeof WorkerGlobalScope !== "undefined" && // eslint-disable-next-line no-undef
  self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
})();
var origin = hasBrowserEnv && window.location.href || "http://localhost";

// node_modules/axios/lib/platform/index.js
var platform_default = {
  ...utils_exports,
  ...node_default
};

// node_modules/axios/lib/helpers/toURLEncodedForm.js
function toURLEncodedForm(data, options) {
  return toFormData_default(data, new platform_default.classes.URLSearchParams(), {
    visitor: function(value, key, path, helpers) {
      if (platform_default.isNode && utils_default.isBuffer(value)) {
        this.append(key, value.toString("base64"));
        return false;
      }
      return helpers.defaultVisitor.apply(this, arguments);
    },
    ...options
  });
}

// node_modules/axios/lib/helpers/formDataToJSON.js
function parsePropPath(name) {
  return utils_default.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
    return match[0] === "[]" ? "" : match[1] || match[0];
  });
}
function arrayToObject(arr) {
  const obj = {};
  const keys = Object.keys(arr);
  let i;
  const len = keys.length;
  let key;
  for (i = 0; i < len; i++) {
    key = keys[i];
    obj[key] = arr[key];
  }
  return obj;
}
function formDataToJSON(formData) {
  function buildPath(path, value, target, index) {
    let name = path[index++];
    if (name === "__proto__") return true;
    const isNumericKey = Number.isFinite(+name);
    const isLast = index >= path.length;
    name = !name && utils_default.isArray(target) ? target.length : name;
    if (isLast) {
      if (utils_default.hasOwnProp(target, name)) {
        target[name] = [target[name], value];
      } else {
        target[name] = value;
      }
      return !isNumericKey;
    }
    if (!target[name] || !utils_default.isObject(target[name])) {
      target[name] = [];
    }
    const result = buildPath(path, value, target[name], index);
    if (result && utils_default.isArray(target[name])) {
      target[name] = arrayToObject(target[name]);
    }
    return !isNumericKey;
  }
  if (utils_default.isFormData(formData) && utils_default.isFunction(formData.entries)) {
    const obj = {};
    utils_default.forEachEntry(formData, (name, value) => {
      buildPath(parsePropPath(name), value, obj, 0);
    });
    return obj;
  }
  return null;
}
var formDataToJSON_default = formDataToJSON;

// node_modules/axios/lib/defaults/index.js
function stringifySafely(rawValue, parser, encoder) {
  if (utils_default.isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue);
      return utils_default.trim(rawValue);
    } catch (e) {
      if (e.name !== "SyntaxError") {
        throw e;
      }
    }
  }
  return (encoder || JSON.stringify)(rawValue);
}
var defaults = {
  transitional: transitional_default,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [
    function transformRequest(data, headers) {
      const contentType = headers.getContentType() || "";
      const hasJSONContentType = contentType.indexOf("application/json") > -1;
      const isObjectPayload = utils_default.isObject(data);
      if (isObjectPayload && utils_default.isHTMLForm(data)) {
        data = new FormData(data);
      }
      const isFormData2 = utils_default.isFormData(data);
      if (isFormData2) {
        return hasJSONContentType ? JSON.stringify(formDataToJSON_default(data)) : data;
      }
      if (utils_default.isArrayBuffer(data) || utils_default.isBuffer(data) || utils_default.isStream(data) || utils_default.isFile(data) || utils_default.isBlob(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (utils_default.isArrayBufferView(data)) {
        return data.buffer;
      }
      if (utils_default.isURLSearchParams(data)) {
        headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
        return data.toString();
      }
      let isFileList2;
      if (isObjectPayload) {
        if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
          return toURLEncodedForm(data, this.formSerializer).toString();
        }
        if ((isFileList2 = utils_default.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
          const _FormData = this.env && this.env.FormData;
          return toFormData_default(
            isFileList2 ? { "files[]": data } : data,
            _FormData && new _FormData(),
            this.formSerializer
          );
        }
      }
      if (isObjectPayload || hasJSONContentType) {
        headers.setContentType("application/json", false);
        return stringifySafely(data);
      }
      return data;
    }
  ],
  transformResponse: [
    function transformResponse(data) {
      const transitional2 = this.transitional || defaults.transitional;
      const forcedJSONParsing = transitional2 && transitional2.forcedJSONParsing;
      const JSONRequested = this.responseType === "json";
      if (utils_default.isResponse(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (data && utils_default.isString(data) && (forcedJSONParsing && !this.responseType || JSONRequested)) {
        const silentJSONParsing = transitional2 && transitional2.silentJSONParsing;
        const strictJSONParsing = !silentJSONParsing && JSONRequested;
        try {
          return JSON.parse(data, this.parseReviver);
        } catch (e) {
          if (strictJSONParsing) {
            if (e.name === "SyntaxError") {
              throw AxiosError_default.from(e, AxiosError_default.ERR_BAD_RESPONSE, this, null, this.response);
            }
            throw e;
          }
        }
      }
      return data;
    }
  ],
  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  maxContentLength: -1,
  maxBodyLength: -1,
  env: {
    FormData: platform_default.classes.FormData,
    Blob: platform_default.classes.Blob
  },
  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  },
  headers: {
    common: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": void 0
    }
  }
};
utils_default.forEach(["delete", "get", "head", "post", "put", "patch"], (method) => {
  defaults.headers[method] = {};
});
var defaults_default = defaults;

// node_modules/axios/lib/helpers/parseHeaders.js
var ignoreDuplicateOf = utils_default.toObjectSet([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent"
]);
var parseHeaders_default = (rawHeaders) => {
  const parsed = {};
  let key;
  let val;
  let i;
  rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
    i = line.indexOf(":");
    key = line.substring(0, i).trim().toLowerCase();
    val = line.substring(i + 1).trim();
    if (!key || parsed[key] && ignoreDuplicateOf[key]) {
      return;
    }
    if (key === "set-cookie") {
      if (parsed[key]) {
        parsed[key].push(val);
      } else {
        parsed[key] = [val];
      }
    } else {
      parsed[key] = parsed[key] ? parsed[key] + ", " + val : val;
    }
  });
  return parsed;
};

// node_modules/axios/lib/core/AxiosHeaders.js
var $internals = Symbol("internals");
function normalizeHeader(header) {
  return header && String(header).trim().toLowerCase();
}
function normalizeValue(value) {
  if (value === false || value == null) {
    return value;
  }
  return utils_default.isArray(value) ? value.map(normalizeValue) : String(value);
}
function parseTokens(str) {
  const tokens = /* @__PURE__ */ Object.create(null);
  const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let match;
  while (match = tokensRE.exec(str)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}
var isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
function matchHeaderValue(context, value, header, filter2, isHeaderNameFilter) {
  if (utils_default.isFunction(filter2)) {
    return filter2.call(this, value, header);
  }
  if (isHeaderNameFilter) {
    value = header;
  }
  if (!utils_default.isString(value)) return;
  if (utils_default.isString(filter2)) {
    return value.indexOf(filter2) !== -1;
  }
  if (utils_default.isRegExp(filter2)) {
    return filter2.test(value);
  }
}
function formatHeader(header) {
  return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w, char, str) => {
    return char.toUpperCase() + str;
  });
}
function buildAccessors(obj, header) {
  const accessorName = utils_default.toCamelCase(" " + header);
  ["get", "set", "has"].forEach((methodName) => {
    Object.defineProperty(obj, methodName + accessorName, {
      value: function(arg1, arg2, arg3) {
        return this[methodName].call(this, header, arg1, arg2, arg3);
      },
      configurable: true
    });
  });
}
var AxiosHeaders = class {
  constructor(headers) {
    headers && this.set(headers);
  }
  set(header, valueOrRewrite, rewrite) {
    const self2 = this;
    function setHeader(_value, _header, _rewrite) {
      const lHeader = normalizeHeader(_header);
      if (!lHeader) {
        throw new Error("header name must be a non-empty string");
      }
      const key = utils_default.findKey(self2, lHeader);
      if (!key || self2[key] === void 0 || _rewrite === true || _rewrite === void 0 && self2[key] !== false) {
        self2[key || _header] = normalizeValue(_value);
      }
    }
    const setHeaders = (headers, _rewrite) => utils_default.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
    if (utils_default.isPlainObject(header) || header instanceof this.constructor) {
      setHeaders(header, valueOrRewrite);
    } else if (utils_default.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
      setHeaders(parseHeaders_default(header), valueOrRewrite);
    } else if (utils_default.isObject(header) && utils_default.isIterable(header)) {
      let obj = {}, dest, key;
      for (const entry of header) {
        if (!utils_default.isArray(entry)) {
          throw TypeError("Object iterator must return a key-value pair");
        }
        obj[key = entry[0]] = (dest = obj[key]) ? utils_default.isArray(dest) ? [...dest, entry[1]] : [dest, entry[1]] : entry[1];
      }
      setHeaders(obj, valueOrRewrite);
    } else {
      header != null && setHeader(valueOrRewrite, header, rewrite);
    }
    return this;
  }
  get(header, parser) {
    header = normalizeHeader(header);
    if (header) {
      const key = utils_default.findKey(this, header);
      if (key) {
        const value = this[key];
        if (!parser) {
          return value;
        }
        if (parser === true) {
          return parseTokens(value);
        }
        if (utils_default.isFunction(parser)) {
          return parser.call(this, value, key);
        }
        if (utils_default.isRegExp(parser)) {
          return parser.exec(value);
        }
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(header, matcher) {
    header = normalizeHeader(header);
    if (header) {
      const key = utils_default.findKey(this, header);
      return !!(key && this[key] !== void 0 && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
    }
    return false;
  }
  delete(header, matcher) {
    const self2 = this;
    let deleted = false;
    function deleteHeader(_header) {
      _header = normalizeHeader(_header);
      if (_header) {
        const key = utils_default.findKey(self2, _header);
        if (key && (!matcher || matchHeaderValue(self2, self2[key], key, matcher))) {
          delete self2[key];
          deleted = true;
        }
      }
    }
    if (utils_default.isArray(header)) {
      header.forEach(deleteHeader);
    } else {
      deleteHeader(header);
    }
    return deleted;
  }
  clear(matcher) {
    const keys = Object.keys(this);
    let i = keys.length;
    let deleted = false;
    while (i--) {
      const key = keys[i];
      if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
        delete this[key];
        deleted = true;
      }
    }
    return deleted;
  }
  normalize(format) {
    const self2 = this;
    const headers = {};
    utils_default.forEach(this, (value, header) => {
      const key = utils_default.findKey(headers, header);
      if (key) {
        self2[key] = normalizeValue(value);
        delete self2[header];
        return;
      }
      const normalized = format ? formatHeader(header) : String(header).trim();
      if (normalized !== header) {
        delete self2[header];
      }
      self2[normalized] = normalizeValue(value);
      headers[normalized] = true;
    });
    return this;
  }
  concat(...targets) {
    return this.constructor.concat(this, ...targets);
  }
  toJSON(asStrings) {
    const obj = /* @__PURE__ */ Object.create(null);
    utils_default.forEach(this, (value, header) => {
      value != null && value !== false && (obj[header] = asStrings && utils_default.isArray(value) ? value.join(", ") : value);
    });
    return obj;
  }
  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }
  toString() {
    return Object.entries(this.toJSON()).map(([header, value]) => header + ": " + value).join("\n");
  }
  getSetCookie() {
    return this.get("set-cookie") || [];
  }
  get [Symbol.toStringTag]() {
    return "AxiosHeaders";
  }
  static from(thing) {
    return thing instanceof this ? thing : new this(thing);
  }
  static concat(first, ...targets) {
    const computed = new this(first);
    targets.forEach((target) => computed.set(target));
    return computed;
  }
  static accessor(header) {
    const internals = this[$internals] = this[$internals] = {
      accessors: {}
    };
    const accessors = internals.accessors;
    const prototype2 = this.prototype;
    function defineAccessor(_header) {
      const lHeader = normalizeHeader(_header);
      if (!accessors[lHeader]) {
        buildAccessors(prototype2, _header);
        accessors[lHeader] = true;
      }
    }
    utils_default.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
    return this;
  }
};
AxiosHeaders.accessor([
  "Content-Type",
  "Content-Length",
  "Accept",
  "Accept-Encoding",
  "User-Agent",
  "Authorization"
]);
utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value }, key) => {
  let mapped = key[0].toUpperCase() + key.slice(1);
  return {
    get: () => value,
    set(headerValue) {
      this[mapped] = headerValue;
    }
  };
});
utils_default.freezeMethods(AxiosHeaders);
var AxiosHeaders_default = AxiosHeaders;

// node_modules/axios/lib/core/transformData.js
function transformData(fns, response) {
  const config = this || defaults_default;
  const context = response || config;
  const headers = AxiosHeaders_default.from(context.headers);
  let data = context.data;
  utils_default.forEach(fns, function transform(fn) {
    data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
  });
  headers.normalize();
  return data;
}

// node_modules/axios/lib/cancel/isCancel.js
function isCancel(value) {
  return !!(value && value.__CANCEL__);
}

// node_modules/axios/lib/cancel/CanceledError.js
var CanceledError = class extends AxiosError_default {
  /**
   * A `CanceledError` is an object that is thrown when an operation is canceled.
   *
   * @param {string=} message The message.
   * @param {Object=} config The config.
   * @param {Object=} request The request.
   *
   * @returns {CanceledError} The created error.
   */
  constructor(message, config, request) {
    super(message == null ? "canceled" : message, AxiosError_default.ERR_CANCELED, config, request);
    this.name = "CanceledError";
    this.__CANCEL__ = true;
  }
};
var CanceledError_default = CanceledError;

// node_modules/axios/lib/core/settle.js
function settle(resolve, reject, response) {
  const validateStatus2 = response.config.validateStatus;
  if (!response.status || !validateStatus2 || validateStatus2(response.status)) {
    resolve(response);
  } else {
    reject(
      new AxiosError_default(
        "Request failed with status code " + response.status,
        [AxiosError_default.ERR_BAD_REQUEST, AxiosError_default.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
        response.config,
        response.request,
        response
      )
    );
  }
}

// node_modules/axios/lib/helpers/isAbsoluteURL.js
function isAbsoluteURL(url2) {
  if (typeof url2 !== "string") {
    return false;
  }
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url2);
}

// node_modules/axios/lib/helpers/combineURLs.js
function combineURLs(baseURL, relativeURL) {
  return relativeURL ? baseURL.replace(/\/?\/$/, "") + "/" + relativeURL.replace(/^\/+/, "") : baseURL;
}

// node_modules/axios/lib/core/buildFullPath.js
function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
  let isRelativeUrl = !isAbsoluteURL(requestedURL);
  if (baseURL && (isRelativeUrl || allowAbsoluteUrls == false)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
}

// node_modules/axios/lib/adapters/http.js
var import_proxy_from_env = __toESM(require_proxy_from_env(), 1);
var import_http = __toESM(require("http"), 1);
var import_https = __toESM(require("https"), 1);
var import_http2 = __toESM(require("http2"), 1);
var import_util2 = __toESM(require("util"), 1);
var import_follow_redirects = __toESM(require_follow_redirects(), 1);
var import_zlib = __toESM(require("zlib"), 1);

// node_modules/axios/lib/env/data.js
var VERSION = "1.13.6";

// node_modules/axios/lib/helpers/parseProtocol.js
function parseProtocol(url2) {
  const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url2);
  return match && match[1] || "";
}

// node_modules/axios/lib/helpers/fromDataURI.js
var DATA_URL_PATTERN = /^(?:([^;]+);)?(?:[^;]+;)?(base64|),([\s\S]*)$/;
function fromDataURI(uri, asBlob, options) {
  const _Blob = options && options.Blob || platform_default.classes.Blob;
  const protocol = parseProtocol(uri);
  if (asBlob === void 0 && _Blob) {
    asBlob = true;
  }
  if (protocol === "data") {
    uri = protocol.length ? uri.slice(protocol.length + 1) : uri;
    const match = DATA_URL_PATTERN.exec(uri);
    if (!match) {
      throw new AxiosError_default("Invalid URL", AxiosError_default.ERR_INVALID_URL);
    }
    const mime = match[1];
    const isBase64 = match[2];
    const body = match[3];
    const buffer = Buffer.from(decodeURIComponent(body), isBase64 ? "base64" : "utf8");
    if (asBlob) {
      if (!_Blob) {
        throw new AxiosError_default("Blob is not supported", AxiosError_default.ERR_NOT_SUPPORT);
      }
      return new _Blob([buffer], { type: mime });
    }
    return buffer;
  }
  throw new AxiosError_default("Unsupported protocol " + protocol, AxiosError_default.ERR_NOT_SUPPORT);
}

// node_modules/axios/lib/adapters/http.js
var import_stream4 = __toESM(require("stream"), 1);

// node_modules/axios/lib/helpers/AxiosTransformStream.js
var import_stream = __toESM(require("stream"), 1);
var kInternals = Symbol("internals");
var AxiosTransformStream = class extends import_stream.default.Transform {
  constructor(options) {
    options = utils_default.toFlatObject(
      options,
      {
        maxRate: 0,
        chunkSize: 64 * 1024,
        minChunkSize: 100,
        timeWindow: 500,
        ticksRate: 2,
        samplesCount: 15
      },
      null,
      (prop, source) => {
        return !utils_default.isUndefined(source[prop]);
      }
    );
    super({
      readableHighWaterMark: options.chunkSize
    });
    const internals = this[kInternals] = {
      timeWindow: options.timeWindow,
      chunkSize: options.chunkSize,
      maxRate: options.maxRate,
      minChunkSize: options.minChunkSize,
      bytesSeen: 0,
      isCaptured: false,
      notifiedBytesLoaded: 0,
      ts: Date.now(),
      bytes: 0,
      onReadCallback: null
    };
    this.on("newListener", (event) => {
      if (event === "progress") {
        if (!internals.isCaptured) {
          internals.isCaptured = true;
        }
      }
    });
  }
  _read(size) {
    const internals = this[kInternals];
    if (internals.onReadCallback) {
      internals.onReadCallback();
    }
    return super._read(size);
  }
  _transform(chunk, encoding, callback) {
    const internals = this[kInternals];
    const maxRate = internals.maxRate;
    const readableHighWaterMark = this.readableHighWaterMark;
    const timeWindow = internals.timeWindow;
    const divider = 1e3 / timeWindow;
    const bytesThreshold = maxRate / divider;
    const minChunkSize = internals.minChunkSize !== false ? Math.max(internals.minChunkSize, bytesThreshold * 0.01) : 0;
    const pushChunk = (_chunk, _callback) => {
      const bytes = Buffer.byteLength(_chunk);
      internals.bytesSeen += bytes;
      internals.bytes += bytes;
      internals.isCaptured && this.emit("progress", internals.bytesSeen);
      if (this.push(_chunk)) {
        process.nextTick(_callback);
      } else {
        internals.onReadCallback = () => {
          internals.onReadCallback = null;
          process.nextTick(_callback);
        };
      }
    };
    const transformChunk = (_chunk, _callback) => {
      const chunkSize = Buffer.byteLength(_chunk);
      let chunkRemainder = null;
      let maxChunkSize = readableHighWaterMark;
      let bytesLeft;
      let passed = 0;
      if (maxRate) {
        const now = Date.now();
        if (!internals.ts || (passed = now - internals.ts) >= timeWindow) {
          internals.ts = now;
          bytesLeft = bytesThreshold - internals.bytes;
          internals.bytes = bytesLeft < 0 ? -bytesLeft : 0;
          passed = 0;
        }
        bytesLeft = bytesThreshold - internals.bytes;
      }
      if (maxRate) {
        if (bytesLeft <= 0) {
          return setTimeout(() => {
            _callback(null, _chunk);
          }, timeWindow - passed);
        }
        if (bytesLeft < maxChunkSize) {
          maxChunkSize = bytesLeft;
        }
      }
      if (maxChunkSize && chunkSize > maxChunkSize && chunkSize - maxChunkSize > minChunkSize) {
        chunkRemainder = _chunk.subarray(maxChunkSize);
        _chunk = _chunk.subarray(0, maxChunkSize);
      }
      pushChunk(
        _chunk,
        chunkRemainder ? () => {
          process.nextTick(_callback, null, chunkRemainder);
        } : _callback
      );
    };
    transformChunk(chunk, function transformNextChunk(err, _chunk) {
      if (err) {
        return callback(err);
      }
      if (_chunk) {
        transformChunk(_chunk, transformNextChunk);
      } else {
        callback(null);
      }
    });
  }
};
var AxiosTransformStream_default = AxiosTransformStream;

// node_modules/axios/lib/adapters/http.js
var import_events = require("events");

// node_modules/axios/lib/helpers/formDataToStream.js
var import_util = __toESM(require("util"), 1);
var import_stream2 = require("stream");

// node_modules/axios/lib/helpers/readBlob.js
var { asyncIterator } = Symbol;
var readBlob = async function* (blob) {
  if (blob.stream) {
    yield* blob.stream();
  } else if (blob.arrayBuffer) {
    yield await blob.arrayBuffer();
  } else if (blob[asyncIterator]) {
    yield* blob[asyncIterator]();
  } else {
    yield blob;
  }
};
var readBlob_default = readBlob;

// node_modules/axios/lib/helpers/formDataToStream.js
var BOUNDARY_ALPHABET = platform_default.ALPHABET.ALPHA_DIGIT + "-_";
var textEncoder = typeof TextEncoder === "function" ? new TextEncoder() : new import_util.default.TextEncoder();
var CRLF = "\r\n";
var CRLF_BYTES = textEncoder.encode(CRLF);
var CRLF_BYTES_COUNT = 2;
var FormDataPart = class {
  constructor(name, value) {
    const { escapeName } = this.constructor;
    const isStringValue = utils_default.isString(value);
    let headers = `Content-Disposition: form-data; name="${escapeName(name)}"${!isStringValue && value.name ? `; filename="${escapeName(value.name)}"` : ""}${CRLF}`;
    if (isStringValue) {
      value = textEncoder.encode(String(value).replace(/\r?\n|\r\n?/g, CRLF));
    } else {
      headers += `Content-Type: ${value.type || "application/octet-stream"}${CRLF}`;
    }
    this.headers = textEncoder.encode(headers + CRLF);
    this.contentLength = isStringValue ? value.byteLength : value.size;
    this.size = this.headers.byteLength + this.contentLength + CRLF_BYTES_COUNT;
    this.name = name;
    this.value = value;
  }
  async *encode() {
    yield this.headers;
    const { value } = this;
    if (utils_default.isTypedArray(value)) {
      yield value;
    } else {
      yield* readBlob_default(value);
    }
    yield CRLF_BYTES;
  }
  static escapeName(name) {
    return String(name).replace(
      /[\r\n"]/g,
      (match) => ({
        "\r": "%0D",
        "\n": "%0A",
        '"': "%22"
      })[match]
    );
  }
};
var formDataToStream = (form, headersHandler, options) => {
  const {
    tag = "form-data-boundary",
    size = 25,
    boundary = tag + "-" + platform_default.generateString(size, BOUNDARY_ALPHABET)
  } = options || {};
  if (!utils_default.isFormData(form)) {
    throw TypeError("FormData instance required");
  }
  if (boundary.length < 1 || boundary.length > 70) {
    throw Error("boundary must be 10-70 characters long");
  }
  const boundaryBytes = textEncoder.encode("--" + boundary + CRLF);
  const footerBytes = textEncoder.encode("--" + boundary + "--" + CRLF);
  let contentLength = footerBytes.byteLength;
  const parts = Array.from(form.entries()).map(([name, value]) => {
    const part = new FormDataPart(name, value);
    contentLength += part.size;
    return part;
  });
  contentLength += boundaryBytes.byteLength * parts.length;
  contentLength = utils_default.toFiniteNumber(contentLength);
  const computedHeaders = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`
  };
  if (Number.isFinite(contentLength)) {
    computedHeaders["Content-Length"] = contentLength;
  }
  headersHandler && headersHandler(computedHeaders);
  return import_stream2.Readable.from(
    async function* () {
      for (const part of parts) {
        yield boundaryBytes;
        yield* part.encode();
      }
      yield footerBytes;
    }()
  );
};
var formDataToStream_default = formDataToStream;

// node_modules/axios/lib/helpers/ZlibHeaderTransformStream.js
var import_stream3 = __toESM(require("stream"), 1);
var ZlibHeaderTransformStream = class extends import_stream3.default.Transform {
  __transform(chunk, encoding, callback) {
    this.push(chunk);
    callback();
  }
  _transform(chunk, encoding, callback) {
    if (chunk.length !== 0) {
      this._transform = this.__transform;
      if (chunk[0] !== 120) {
        const header = Buffer.alloc(2);
        header[0] = 120;
        header[1] = 156;
        this.push(header, encoding);
      }
    }
    this.__transform(chunk, encoding, callback);
  }
};
var ZlibHeaderTransformStream_default = ZlibHeaderTransformStream;

// node_modules/axios/lib/helpers/callbackify.js
var callbackify = (fn, reducer) => {
  return utils_default.isAsyncFn(fn) ? function(...args) {
    const cb = args.pop();
    fn.apply(this, args).then((value) => {
      try {
        reducer ? cb(null, ...reducer(value)) : cb(null, value);
      } catch (err) {
        cb(err);
      }
    }, cb);
  } : fn;
};
var callbackify_default = callbackify;

// node_modules/axios/lib/helpers/speedometer.js
function speedometer(samplesCount, min) {
  samplesCount = samplesCount || 10;
  const bytes = new Array(samplesCount);
  const timestamps = new Array(samplesCount);
  let head = 0;
  let tail = 0;
  let firstSampleTS;
  min = min !== void 0 ? min : 1e3;
  return function push(chunkLength) {
    const now = Date.now();
    const startedAt = timestamps[tail];
    if (!firstSampleTS) {
      firstSampleTS = now;
    }
    bytes[head] = chunkLength;
    timestamps[head] = now;
    let i = tail;
    let bytesCount = 0;
    while (i !== head) {
      bytesCount += bytes[i++];
      i = i % samplesCount;
    }
    head = (head + 1) % samplesCount;
    if (head === tail) {
      tail = (tail + 1) % samplesCount;
    }
    if (now - firstSampleTS < min) {
      return;
    }
    const passed = startedAt && now - startedAt;
    return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
  };
}
var speedometer_default = speedometer;

// node_modules/axios/lib/helpers/throttle.js
function throttle(fn, freq) {
  let timestamp = 0;
  let threshold = 1e3 / freq;
  let lastArgs;
  let timer;
  const invoke = (args, now = Date.now()) => {
    timestamp = now;
    lastArgs = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };
  const throttled = (...args) => {
    const now = Date.now();
    const passed = now - timestamp;
    if (passed >= threshold) {
      invoke(args, now);
    } else {
      lastArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          invoke(lastArgs);
        }, threshold - passed);
      }
    }
  };
  const flush = () => lastArgs && invoke(lastArgs);
  return [throttled, flush];
}
var throttle_default = throttle;

// node_modules/axios/lib/helpers/progressEventReducer.js
var progressEventReducer = (listener, isDownloadStream, freq = 3) => {
  let bytesNotified = 0;
  const _speedometer = speedometer_default(50, 250);
  return throttle_default((e) => {
    const loaded = e.loaded;
    const total = e.lengthComputable ? e.total : void 0;
    const progressBytes = loaded - bytesNotified;
    const rate = _speedometer(progressBytes);
    const inRange = loaded <= total;
    bytesNotified = loaded;
    const data = {
      loaded,
      total,
      progress: total ? loaded / total : void 0,
      bytes: progressBytes,
      rate: rate ? rate : void 0,
      estimated: rate && total && inRange ? (total - loaded) / rate : void 0,
      event: e,
      lengthComputable: total != null,
      [isDownloadStream ? "download" : "upload"]: true
    };
    listener(data);
  }, freq);
};
var progressEventDecorator = (total, throttled) => {
  const lengthComputable = total != null;
  return [
    (loaded) => throttled[0]({
      lengthComputable,
      total,
      loaded
    }),
    throttled[1]
  ];
};
var asyncDecorator = (fn) => (...args) => utils_default.asap(() => fn(...args));

// node_modules/axios/lib/helpers/estimateDataURLDecodedBytes.js
function estimateDataURLDecodedBytes(url2) {
  if (!url2 || typeof url2 !== "string") return 0;
  if (!url2.startsWith("data:")) return 0;
  const comma = url2.indexOf(",");
  if (comma < 0) return 0;
  const meta = url2.slice(5, comma);
  const body = url2.slice(comma + 1);
  const isBase64 = /;base64/i.test(meta);
  if (isBase64) {
    let effectiveLen = body.length;
    const len = body.length;
    for (let i = 0; i < len; i++) {
      if (body.charCodeAt(i) === 37 && i + 2 < len) {
        const a = body.charCodeAt(i + 1);
        const b = body.charCodeAt(i + 2);
        const isHex = (a >= 48 && a <= 57 || a >= 65 && a <= 70 || a >= 97 && a <= 102) && (b >= 48 && b <= 57 || b >= 65 && b <= 70 || b >= 97 && b <= 102);
        if (isHex) {
          effectiveLen -= 2;
          i += 2;
        }
      }
    }
    let pad = 0;
    let idx = len - 1;
    const tailIsPct3D = (j) => j >= 2 && body.charCodeAt(j - 2) === 37 && // '%'
    body.charCodeAt(j - 1) === 51 && // '3'
    (body.charCodeAt(j) === 68 || body.charCodeAt(j) === 100);
    if (idx >= 0) {
      if (body.charCodeAt(idx) === 61) {
        pad++;
        idx--;
      } else if (tailIsPct3D(idx)) {
        pad++;
        idx -= 3;
      }
    }
    if (pad === 1 && idx >= 0) {
      if (body.charCodeAt(idx) === 61) {
        pad++;
      } else if (tailIsPct3D(idx)) {
        pad++;
      }
    }
    const groups = Math.floor(effectiveLen / 4);
    const bytes = groups * 3 - (pad || 0);
    return bytes > 0 ? bytes : 0;
  }
  return Buffer.byteLength(body, "utf8");
}

// node_modules/axios/lib/adapters/http.js
var zlibOptions = {
  flush: import_zlib.default.constants.Z_SYNC_FLUSH,
  finishFlush: import_zlib.default.constants.Z_SYNC_FLUSH
};
var brotliOptions = {
  flush: import_zlib.default.constants.BROTLI_OPERATION_FLUSH,
  finishFlush: import_zlib.default.constants.BROTLI_OPERATION_FLUSH
};
var isBrotliSupported = utils_default.isFunction(import_zlib.default.createBrotliDecompress);
var { http: httpFollow, https: httpsFollow } = import_follow_redirects.default;
var isHttps = /https:?/;
var supportedProtocols = platform_default.protocols.map((protocol) => {
  return protocol + ":";
});
var flushOnFinish = (stream4, [throttled, flush]) => {
  stream4.on("end", flush).on("error", flush);
  return throttled;
};
var Http2Sessions = class {
  constructor() {
    this.sessions = /* @__PURE__ */ Object.create(null);
  }
  getSession(authority, options) {
    options = Object.assign(
      {
        sessionTimeout: 1e3
      },
      options
    );
    let authoritySessions = this.sessions[authority];
    if (authoritySessions) {
      let len = authoritySessions.length;
      for (let i = 0; i < len; i++) {
        const [sessionHandle, sessionOptions] = authoritySessions[i];
        if (!sessionHandle.destroyed && !sessionHandle.closed && import_util2.default.isDeepStrictEqual(sessionOptions, options)) {
          return sessionHandle;
        }
      }
    }
    const session = import_http2.default.connect(authority, options);
    let removed;
    const removeSession = () => {
      if (removed) {
        return;
      }
      removed = true;
      let entries = authoritySessions, len = entries.length, i = len;
      while (i--) {
        if (entries[i][0] === session) {
          if (len === 1) {
            delete this.sessions[authority];
          } else {
            entries.splice(i, 1);
          }
          return;
        }
      }
    };
    const originalRequestFn = session.request;
    const { sessionTimeout } = options;
    if (sessionTimeout != null) {
      let timer;
      let streamsCount = 0;
      session.request = function() {
        const stream4 = originalRequestFn.apply(this, arguments);
        streamsCount++;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        stream4.once("close", () => {
          if (!--streamsCount) {
            timer = setTimeout(() => {
              timer = null;
              removeSession();
            }, sessionTimeout);
          }
        });
        return stream4;
      };
    }
    session.once("close", removeSession);
    let entry = [session, options];
    authoritySessions ? authoritySessions.push(entry) : authoritySessions = this.sessions[authority] = [entry];
    return session;
  }
};
var http2Sessions = new Http2Sessions();
function dispatchBeforeRedirect(options, responseDetails) {
  if (options.beforeRedirects.proxy) {
    options.beforeRedirects.proxy(options);
  }
  if (options.beforeRedirects.config) {
    options.beforeRedirects.config(options, responseDetails);
  }
}
function setProxy(options, configProxy, location) {
  let proxy = configProxy;
  if (!proxy && proxy !== false) {
    const proxyUrl = import_proxy_from_env.default.getProxyForUrl(location);
    if (proxyUrl) {
      proxy = new URL(proxyUrl);
    }
  }
  if (proxy) {
    if (proxy.username) {
      proxy.auth = (proxy.username || "") + ":" + (proxy.password || "");
    }
    if (proxy.auth) {
      const validProxyAuth = Boolean(proxy.auth.username || proxy.auth.password);
      if (validProxyAuth) {
        proxy.auth = (proxy.auth.username || "") + ":" + (proxy.auth.password || "");
      } else if (typeof proxy.auth === "object") {
        throw new AxiosError_default("Invalid proxy authorization", AxiosError_default.ERR_BAD_OPTION, { proxy });
      }
      const base64 = Buffer.from(proxy.auth, "utf8").toString("base64");
      options.headers["Proxy-Authorization"] = "Basic " + base64;
    }
    options.headers.host = options.hostname + (options.port ? ":" + options.port : "");
    const proxyHost = proxy.hostname || proxy.host;
    options.hostname = proxyHost;
    options.host = proxyHost;
    options.port = proxy.port;
    options.path = location;
    if (proxy.protocol) {
      options.protocol = proxy.protocol.includes(":") ? proxy.protocol : `${proxy.protocol}:`;
    }
  }
  options.beforeRedirects.proxy = function beforeRedirect(redirectOptions) {
    setProxy(redirectOptions, configProxy, redirectOptions.href);
  };
}
var isHttpAdapterSupported = typeof process !== "undefined" && utils_default.kindOf(process) === "process";
var wrapAsync = (asyncExecutor) => {
  return new Promise((resolve, reject) => {
    let onDone;
    let isDone;
    const done = (value, isRejected) => {
      if (isDone) return;
      isDone = true;
      onDone && onDone(value, isRejected);
    };
    const _resolve = (value) => {
      done(value);
      resolve(value);
    };
    const _reject = (reason) => {
      done(reason, true);
      reject(reason);
    };
    asyncExecutor(_resolve, _reject, (onDoneHandler) => onDone = onDoneHandler).catch(_reject);
  });
};
var resolveFamily = ({ address, family }) => {
  if (!utils_default.isString(address)) {
    throw TypeError("address must be a string");
  }
  return {
    address,
    family: family || (address.indexOf(".") < 0 ? 6 : 4)
  };
};
var buildAddressEntry = (address, family) => resolveFamily(utils_default.isObject(address) ? address : { address, family });
var http2Transport = {
  request(options, cb) {
    const authority = options.protocol + "//" + options.hostname + ":" + (options.port || (options.protocol === "https:" ? 443 : 80));
    const { http2Options, headers } = options;
    const session = http2Sessions.getSession(authority, http2Options);
    const { HTTP2_HEADER_SCHEME, HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, HTTP2_HEADER_STATUS } = import_http2.default.constants;
    const http2Headers = {
      [HTTP2_HEADER_SCHEME]: options.protocol.replace(":", ""),
      [HTTP2_HEADER_METHOD]: options.method,
      [HTTP2_HEADER_PATH]: options.path
    };
    utils_default.forEach(headers, (header, name) => {
      name.charAt(0) !== ":" && (http2Headers[name] = header);
    });
    const req = session.request(http2Headers);
    req.once("response", (responseHeaders) => {
      const response = req;
      responseHeaders = Object.assign({}, responseHeaders);
      const status = responseHeaders[HTTP2_HEADER_STATUS];
      delete responseHeaders[HTTP2_HEADER_STATUS];
      response.headers = responseHeaders;
      response.statusCode = +status;
      cb(response);
    });
    return req;
  }
};
var http_default = isHttpAdapterSupported && function httpAdapter(config) {
  return wrapAsync(async function dispatchHttpRequest(resolve, reject, onDone) {
    let { data, lookup, family, httpVersion = 1, http2Options } = config;
    const { responseType, responseEncoding } = config;
    const method = config.method.toUpperCase();
    let isDone;
    let rejected = false;
    let req;
    httpVersion = +httpVersion;
    if (Number.isNaN(httpVersion)) {
      throw TypeError(`Invalid protocol version: '${config.httpVersion}' is not a number`);
    }
    if (httpVersion !== 1 && httpVersion !== 2) {
      throw TypeError(`Unsupported protocol version '${httpVersion}'`);
    }
    const isHttp2 = httpVersion === 2;
    if (lookup) {
      const _lookup = callbackify_default(lookup, (value) => utils_default.isArray(value) ? value : [value]);
      lookup = (hostname2, opt, cb) => {
        _lookup(hostname2, opt, (err, arg0, arg1) => {
          if (err) {
            return cb(err);
          }
          const addresses = utils_default.isArray(arg0) ? arg0.map((addr) => buildAddressEntry(addr)) : [buildAddressEntry(arg0, arg1)];
          opt.all ? cb(err, addresses) : cb(err, addresses[0].address, addresses[0].family);
        });
      };
    }
    const abortEmitter = new import_events.EventEmitter();
    function abort(reason) {
      try {
        abortEmitter.emit(
          "abort",
          !reason || reason.type ? new CanceledError_default(null, config, req) : reason
        );
      } catch (err) {
        console.warn("emit error", err);
      }
    }
    abortEmitter.once("abort", reject);
    const onFinished = () => {
      if (config.cancelToken) {
        config.cancelToken.unsubscribe(abort);
      }
      if (config.signal) {
        config.signal.removeEventListener("abort", abort);
      }
      abortEmitter.removeAllListeners();
    };
    if (config.cancelToken || config.signal) {
      config.cancelToken && config.cancelToken.subscribe(abort);
      if (config.signal) {
        config.signal.aborted ? abort() : config.signal.addEventListener("abort", abort);
      }
    }
    onDone((response, isRejected) => {
      isDone = true;
      if (isRejected) {
        rejected = true;
        onFinished();
        return;
      }
      const { data: data2 } = response;
      if (data2 instanceof import_stream4.default.Readable || data2 instanceof import_stream4.default.Duplex) {
        const offListeners = import_stream4.default.finished(data2, () => {
          offListeners();
          onFinished();
        });
      } else {
        onFinished();
      }
    });
    const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
    const parsed = new URL(fullPath, platform_default.hasBrowserEnv ? platform_default.origin : void 0);
    const protocol = parsed.protocol || supportedProtocols[0];
    if (protocol === "data:") {
      if (config.maxContentLength > -1) {
        const dataUrl = String(config.url || fullPath || "");
        const estimated = estimateDataURLDecodedBytes(dataUrl);
        if (estimated > config.maxContentLength) {
          return reject(
            new AxiosError_default(
              "maxContentLength size of " + config.maxContentLength + " exceeded",
              AxiosError_default.ERR_BAD_RESPONSE,
              config
            )
          );
        }
      }
      let convertedData;
      if (method !== "GET") {
        return settle(resolve, reject, {
          status: 405,
          statusText: "method not allowed",
          headers: {},
          config
        });
      }
      try {
        convertedData = fromDataURI(config.url, responseType === "blob", {
          Blob: config.env && config.env.Blob
        });
      } catch (err) {
        throw AxiosError_default.from(err, AxiosError_default.ERR_BAD_REQUEST, config);
      }
      if (responseType === "text") {
        convertedData = convertedData.toString(responseEncoding);
        if (!responseEncoding || responseEncoding === "utf8") {
          convertedData = utils_default.stripBOM(convertedData);
        }
      } else if (responseType === "stream") {
        convertedData = import_stream4.default.Readable.from(convertedData);
      }
      return settle(resolve, reject, {
        data: convertedData,
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders_default(),
        config
      });
    }
    if (supportedProtocols.indexOf(protocol) === -1) {
      return reject(
        new AxiosError_default("Unsupported protocol " + protocol, AxiosError_default.ERR_BAD_REQUEST, config)
      );
    }
    const headers = AxiosHeaders_default.from(config.headers).normalize();
    headers.set("User-Agent", "axios/" + VERSION, false);
    const { onUploadProgress, onDownloadProgress } = config;
    const maxRate = config.maxRate;
    let maxUploadRate = void 0;
    let maxDownloadRate = void 0;
    if (utils_default.isSpecCompliantForm(data)) {
      const userBoundary = headers.getContentType(/boundary=([-_\w\d]{10,70})/i);
      data = formDataToStream_default(
        data,
        (formHeaders) => {
          headers.set(formHeaders);
        },
        {
          tag: `axios-${VERSION}-boundary`,
          boundary: userBoundary && userBoundary[1] || void 0
        }
      );
    } else if (utils_default.isFormData(data) && utils_default.isFunction(data.getHeaders)) {
      headers.set(data.getHeaders());
      if (!headers.hasContentLength()) {
        try {
          const knownLength = await import_util2.default.promisify(data.getLength).call(data);
          Number.isFinite(knownLength) && knownLength >= 0 && headers.setContentLength(knownLength);
        } catch (e) {
        }
      }
    } else if (utils_default.isBlob(data) || utils_default.isFile(data)) {
      data.size && headers.setContentType(data.type || "application/octet-stream");
      headers.setContentLength(data.size || 0);
      data = import_stream4.default.Readable.from(readBlob_default(data));
    } else if (data && !utils_default.isStream(data)) {
      if (Buffer.isBuffer(data)) {
      } else if (utils_default.isArrayBuffer(data)) {
        data = Buffer.from(new Uint8Array(data));
      } else if (utils_default.isString(data)) {
        data = Buffer.from(data, "utf-8");
      } else {
        return reject(
          new AxiosError_default(
            "Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream",
            AxiosError_default.ERR_BAD_REQUEST,
            config
          )
        );
      }
      headers.setContentLength(data.length, false);
      if (config.maxBodyLength > -1 && data.length > config.maxBodyLength) {
        return reject(
          new AxiosError_default(
            "Request body larger than maxBodyLength limit",
            AxiosError_default.ERR_BAD_REQUEST,
            config
          )
        );
      }
    }
    const contentLength = utils_default.toFiniteNumber(headers.getContentLength());
    if (utils_default.isArray(maxRate)) {
      maxUploadRate = maxRate[0];
      maxDownloadRate = maxRate[1];
    } else {
      maxUploadRate = maxDownloadRate = maxRate;
    }
    if (data && (onUploadProgress || maxUploadRate)) {
      if (!utils_default.isStream(data)) {
        data = import_stream4.default.Readable.from(data, { objectMode: false });
      }
      data = import_stream4.default.pipeline(
        [
          data,
          new AxiosTransformStream_default({
            maxRate: utils_default.toFiniteNumber(maxUploadRate)
          })
        ],
        utils_default.noop
      );
      onUploadProgress && data.on(
        "progress",
        flushOnFinish(
          data,
          progressEventDecorator(
            contentLength,
            progressEventReducer(asyncDecorator(onUploadProgress), false, 3)
          )
        )
      );
    }
    let auth = void 0;
    if (config.auth) {
      const username = config.auth.username || "";
      const password = config.auth.password || "";
      auth = username + ":" + password;
    }
    if (!auth && parsed.username) {
      const urlUsername = parsed.username;
      const urlPassword = parsed.password;
      auth = urlUsername + ":" + urlPassword;
    }
    auth && headers.delete("authorization");
    let path;
    try {
      path = buildURL(
        parsed.pathname + parsed.search,
        config.params,
        config.paramsSerializer
      ).replace(/^\?/, "");
    } catch (err) {
      const customErr = new Error(err.message);
      customErr.config = config;
      customErr.url = config.url;
      customErr.exists = true;
      return reject(customErr);
    }
    headers.set(
      "Accept-Encoding",
      "gzip, compress, deflate" + (isBrotliSupported ? ", br" : ""),
      false
    );
    const options = {
      path,
      method,
      headers: headers.toJSON(),
      agents: { http: config.httpAgent, https: config.httpsAgent },
      auth,
      protocol,
      family,
      beforeRedirect: dispatchBeforeRedirect,
      beforeRedirects: {},
      http2Options
    };
    !utils_default.isUndefined(lookup) && (options.lookup = lookup);
    if (config.socketPath) {
      options.socketPath = config.socketPath;
    } else {
      options.hostname = parsed.hostname.startsWith("[") ? parsed.hostname.slice(1, -1) : parsed.hostname;
      options.port = parsed.port;
      setProxy(
        options,
        config.proxy,
        protocol + "//" + parsed.hostname + (parsed.port ? ":" + parsed.port : "") + options.path
      );
    }
    let transport;
    const isHttpsRequest = isHttps.test(options.protocol);
    options.agent = isHttpsRequest ? config.httpsAgent : config.httpAgent;
    if (isHttp2) {
      transport = http2Transport;
    } else {
      if (config.transport) {
        transport = config.transport;
      } else if (config.maxRedirects === 0) {
        transport = isHttpsRequest ? import_https.default : import_http.default;
      } else {
        if (config.maxRedirects) {
          options.maxRedirects = config.maxRedirects;
        }
        if (config.beforeRedirect) {
          options.beforeRedirects.config = config.beforeRedirect;
        }
        transport = isHttpsRequest ? httpsFollow : httpFollow;
      }
    }
    if (config.maxBodyLength > -1) {
      options.maxBodyLength = config.maxBodyLength;
    } else {
      options.maxBodyLength = Infinity;
    }
    if (config.insecureHTTPParser) {
      options.insecureHTTPParser = config.insecureHTTPParser;
    }
    req = transport.request(options, function handleResponse(res) {
      if (req.destroyed) return;
      const streams = [res];
      const responseLength = utils_default.toFiniteNumber(res.headers["content-length"]);
      if (onDownloadProgress || maxDownloadRate) {
        const transformStream = new AxiosTransformStream_default({
          maxRate: utils_default.toFiniteNumber(maxDownloadRate)
        });
        onDownloadProgress && transformStream.on(
          "progress",
          flushOnFinish(
            transformStream,
            progressEventDecorator(
              responseLength,
              progressEventReducer(asyncDecorator(onDownloadProgress), true, 3)
            )
          )
        );
        streams.push(transformStream);
      }
      let responseStream = res;
      const lastRequest = res.req || req;
      if (config.decompress !== false && res.headers["content-encoding"]) {
        if (method === "HEAD" || res.statusCode === 204) {
          delete res.headers["content-encoding"];
        }
        switch ((res.headers["content-encoding"] || "").toLowerCase()) {
          /*eslint default-case:0*/
          case "gzip":
          case "x-gzip":
          case "compress":
          case "x-compress":
            streams.push(import_zlib.default.createUnzip(zlibOptions));
            delete res.headers["content-encoding"];
            break;
          case "deflate":
            streams.push(new ZlibHeaderTransformStream_default());
            streams.push(import_zlib.default.createUnzip(zlibOptions));
            delete res.headers["content-encoding"];
            break;
          case "br":
            if (isBrotliSupported) {
              streams.push(import_zlib.default.createBrotliDecompress(brotliOptions));
              delete res.headers["content-encoding"];
            }
        }
      }
      responseStream = streams.length > 1 ? import_stream4.default.pipeline(streams, utils_default.noop) : streams[0];
      const response = {
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: new AxiosHeaders_default(res.headers),
        config,
        request: lastRequest
      };
      if (responseType === "stream") {
        response.data = responseStream;
        settle(resolve, reject, response);
      } else {
        const responseBuffer = [];
        let totalResponseBytes = 0;
        responseStream.on("data", function handleStreamData(chunk) {
          responseBuffer.push(chunk);
          totalResponseBytes += chunk.length;
          if (config.maxContentLength > -1 && totalResponseBytes > config.maxContentLength) {
            rejected = true;
            responseStream.destroy();
            abort(
              new AxiosError_default(
                "maxContentLength size of " + config.maxContentLength + " exceeded",
                AxiosError_default.ERR_BAD_RESPONSE,
                config,
                lastRequest
              )
            );
          }
        });
        responseStream.on("aborted", function handlerStreamAborted() {
          if (rejected) {
            return;
          }
          const err = new AxiosError_default(
            "stream has been aborted",
            AxiosError_default.ERR_BAD_RESPONSE,
            config,
            lastRequest
          );
          responseStream.destroy(err);
          reject(err);
        });
        responseStream.on("error", function handleStreamError(err) {
          if (req.destroyed) return;
          reject(AxiosError_default.from(err, null, config, lastRequest));
        });
        responseStream.on("end", function handleStreamEnd() {
          try {
            let responseData = responseBuffer.length === 1 ? responseBuffer[0] : Buffer.concat(responseBuffer);
            if (responseType !== "arraybuffer") {
              responseData = responseData.toString(responseEncoding);
              if (!responseEncoding || responseEncoding === "utf8") {
                responseData = utils_default.stripBOM(responseData);
              }
            }
            response.data = responseData;
          } catch (err) {
            return reject(AxiosError_default.from(err, null, config, response.request, response));
          }
          settle(resolve, reject, response);
        });
      }
      abortEmitter.once("abort", (err) => {
        if (!responseStream.destroyed) {
          responseStream.emit("error", err);
          responseStream.destroy();
        }
      });
    });
    abortEmitter.once("abort", (err) => {
      if (req.close) {
        req.close();
      } else {
        req.destroy(err);
      }
    });
    req.on("error", function handleRequestError(err) {
      reject(AxiosError_default.from(err, null, config, req));
    });
    req.on("socket", function handleRequestSocket(socket) {
      socket.setKeepAlive(true, 1e3 * 60);
    });
    if (config.timeout) {
      const timeout = parseInt(config.timeout, 10);
      if (Number.isNaN(timeout)) {
        abort(
          new AxiosError_default(
            "error trying to parse `config.timeout` to int",
            AxiosError_default.ERR_BAD_OPTION_VALUE,
            config,
            req
          )
        );
        return;
      }
      req.setTimeout(timeout, function handleRequestTimeout() {
        if (isDone) return;
        let timeoutErrorMessage = config.timeout ? "timeout of " + config.timeout + "ms exceeded" : "timeout exceeded";
        const transitional2 = config.transitional || transitional_default;
        if (config.timeoutErrorMessage) {
          timeoutErrorMessage = config.timeoutErrorMessage;
        }
        abort(
          new AxiosError_default(
            timeoutErrorMessage,
            transitional2.clarifyTimeoutError ? AxiosError_default.ETIMEDOUT : AxiosError_default.ECONNABORTED,
            config,
            req
          )
        );
      });
    } else {
      req.setTimeout(0);
    }
    if (utils_default.isStream(data)) {
      let ended = false;
      let errored = false;
      data.on("end", () => {
        ended = true;
      });
      data.once("error", (err) => {
        errored = true;
        req.destroy(err);
      });
      data.on("close", () => {
        if (!ended && !errored) {
          abort(new CanceledError_default("Request stream has been aborted", config, req));
        }
      });
      data.pipe(req);
    } else {
      data && req.write(data);
      req.end();
    }
  });
};

// node_modules/axios/lib/helpers/isURLSameOrigin.js
var isURLSameOrigin_default = platform_default.hasStandardBrowserEnv ? /* @__PURE__ */ ((origin2, isMSIE) => (url2) => {
  url2 = new URL(url2, platform_default.origin);
  return origin2.protocol === url2.protocol && origin2.host === url2.host && (isMSIE || origin2.port === url2.port);
})(
  new URL(platform_default.origin),
  platform_default.navigator && /(msie|trident)/i.test(platform_default.navigator.userAgent)
) : () => true;

// node_modules/axios/lib/helpers/cookies.js
var cookies_default = platform_default.hasStandardBrowserEnv ? (
  // Standard browser envs support document.cookie
  {
    write(name, value, expires, path, domain, secure, sameSite) {
      if (typeof document === "undefined") return;
      const cookie = [`${name}=${encodeURIComponent(value)}`];
      if (utils_default.isNumber(expires)) {
        cookie.push(`expires=${new Date(expires).toUTCString()}`);
      }
      if (utils_default.isString(path)) {
        cookie.push(`path=${path}`);
      }
      if (utils_default.isString(domain)) {
        cookie.push(`domain=${domain}`);
      }
      if (secure === true) {
        cookie.push("secure");
      }
      if (utils_default.isString(sameSite)) {
        cookie.push(`SameSite=${sameSite}`);
      }
      document.cookie = cookie.join("; ");
    },
    read(name) {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : null;
    },
    remove(name) {
      this.write(name, "", Date.now() - 864e5, "/");
    }
  }
) : (
  // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {
    },
    read() {
      return null;
    },
    remove() {
    }
  }
);

// node_modules/axios/lib/core/mergeConfig.js
var headersToObject = (thing) => thing instanceof AxiosHeaders_default ? { ...thing } : thing;
function mergeConfig(config1, config2) {
  config2 = config2 || {};
  const config = {};
  function getMergedValue(target, source, prop, caseless) {
    if (utils_default.isPlainObject(target) && utils_default.isPlainObject(source)) {
      return utils_default.merge.call({ caseless }, target, source);
    } else if (utils_default.isPlainObject(source)) {
      return utils_default.merge({}, source);
    } else if (utils_default.isArray(source)) {
      return source.slice();
    }
    return source;
  }
  function mergeDeepProperties(a, b, prop, caseless) {
    if (!utils_default.isUndefined(b)) {
      return getMergedValue(a, b, prop, caseless);
    } else if (!utils_default.isUndefined(a)) {
      return getMergedValue(void 0, a, prop, caseless);
    }
  }
  function valueFromConfig2(a, b) {
    if (!utils_default.isUndefined(b)) {
      return getMergedValue(void 0, b);
    }
  }
  function defaultToConfig2(a, b) {
    if (!utils_default.isUndefined(b)) {
      return getMergedValue(void 0, b);
    } else if (!utils_default.isUndefined(a)) {
      return getMergedValue(void 0, a);
    }
  }
  function mergeDirectKeys(a, b, prop) {
    if (prop in config2) {
      return getMergedValue(a, b);
    } else if (prop in config1) {
      return getMergedValue(void 0, a);
    }
  }
  const mergeMap = {
    url: valueFromConfig2,
    method: valueFromConfig2,
    data: valueFromConfig2,
    baseURL: defaultToConfig2,
    transformRequest: defaultToConfig2,
    transformResponse: defaultToConfig2,
    paramsSerializer: defaultToConfig2,
    timeout: defaultToConfig2,
    timeoutMessage: defaultToConfig2,
    withCredentials: defaultToConfig2,
    withXSRFToken: defaultToConfig2,
    adapter: defaultToConfig2,
    responseType: defaultToConfig2,
    xsrfCookieName: defaultToConfig2,
    xsrfHeaderName: defaultToConfig2,
    onUploadProgress: defaultToConfig2,
    onDownloadProgress: defaultToConfig2,
    decompress: defaultToConfig2,
    maxContentLength: defaultToConfig2,
    maxBodyLength: defaultToConfig2,
    beforeRedirect: defaultToConfig2,
    transport: defaultToConfig2,
    httpAgent: defaultToConfig2,
    httpsAgent: defaultToConfig2,
    cancelToken: defaultToConfig2,
    socketPath: defaultToConfig2,
    responseEncoding: defaultToConfig2,
    validateStatus: mergeDirectKeys,
    headers: (a, b, prop) => mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true)
  };
  utils_default.forEach(Object.keys({ ...config1, ...config2 }), function computeConfigValue(prop) {
    if (prop === "__proto__" || prop === "constructor" || prop === "prototype") return;
    const merge2 = utils_default.hasOwnProp(mergeMap, prop) ? mergeMap[prop] : mergeDeepProperties;
    const configValue = merge2(config1[prop], config2[prop], prop);
    utils_default.isUndefined(configValue) && merge2 !== mergeDirectKeys || (config[prop] = configValue);
  });
  return config;
}

// node_modules/axios/lib/helpers/resolveConfig.js
var resolveConfig_default = (config) => {
  const newConfig = mergeConfig({}, config);
  let { data, withXSRFToken, xsrfHeaderName, xsrfCookieName, headers, auth } = newConfig;
  newConfig.headers = headers = AxiosHeaders_default.from(headers);
  newConfig.url = buildURL(
    buildFullPath(newConfig.baseURL, newConfig.url, newConfig.allowAbsoluteUrls),
    config.params,
    config.paramsSerializer
  );
  if (auth) {
    headers.set(
      "Authorization",
      "Basic " + btoa(
        (auth.username || "") + ":" + (auth.password ? unescape(encodeURIComponent(auth.password)) : "")
      )
    );
  }
  if (utils_default.isFormData(data)) {
    if (platform_default.hasStandardBrowserEnv || platform_default.hasStandardBrowserWebWorkerEnv) {
      headers.setContentType(void 0);
    } else if (utils_default.isFunction(data.getHeaders)) {
      const formHeaders = data.getHeaders();
      const allowedHeaders = ["content-type", "content-length"];
      Object.entries(formHeaders).forEach(([key, val]) => {
        if (allowedHeaders.includes(key.toLowerCase())) {
          headers.set(key, val);
        }
      });
    }
  }
  if (platform_default.hasStandardBrowserEnv) {
    withXSRFToken && utils_default.isFunction(withXSRFToken) && (withXSRFToken = withXSRFToken(newConfig));
    if (withXSRFToken || withXSRFToken !== false && isURLSameOrigin_default(newConfig.url)) {
      const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies_default.read(xsrfCookieName);
      if (xsrfValue) {
        headers.set(xsrfHeaderName, xsrfValue);
      }
    }
  }
  return newConfig;
};

// node_modules/axios/lib/adapters/xhr.js
var isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
var xhr_default = isXHRAdapterSupported && function(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    const _config = resolveConfig_default(config);
    let requestData = _config.data;
    const requestHeaders = AxiosHeaders_default.from(_config.headers).normalize();
    let { responseType, onUploadProgress, onDownloadProgress } = _config;
    let onCanceled;
    let uploadThrottled, downloadThrottled;
    let flushUpload, flushDownload;
    function done() {
      flushUpload && flushUpload();
      flushDownload && flushDownload();
      _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
      _config.signal && _config.signal.removeEventListener("abort", onCanceled);
    }
    let request = new XMLHttpRequest();
    request.open(_config.method.toUpperCase(), _config.url, true);
    request.timeout = _config.timeout;
    function onloadend() {
      if (!request) {
        return;
      }
      const responseHeaders = AxiosHeaders_default.from(
        "getAllResponseHeaders" in request && request.getAllResponseHeaders()
      );
      const responseData = !responseType || responseType === "text" || responseType === "json" ? request.responseText : request.response;
      const response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config,
        request
      };
      settle(
        function _resolve(value) {
          resolve(value);
          done();
        },
        function _reject(err) {
          reject(err);
          done();
        },
        response
      );
      request = null;
    }
    if ("onloadend" in request) {
      request.onloadend = onloadend;
    } else {
      request.onreadystatechange = function handleLoad() {
        if (!request || request.readyState !== 4) {
          return;
        }
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf("file:") === 0)) {
          return;
        }
        setTimeout(onloadend);
      };
    }
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }
      reject(new AxiosError_default("Request aborted", AxiosError_default.ECONNABORTED, config, request));
      request = null;
    };
    request.onerror = function handleError(event) {
      const msg = event && event.message ? event.message : "Network Error";
      const err = new AxiosError_default(msg, AxiosError_default.ERR_NETWORK, config, request);
      err.event = event || null;
      reject(err);
      request = null;
    };
    request.ontimeout = function handleTimeout() {
      let timeoutErrorMessage = _config.timeout ? "timeout of " + _config.timeout + "ms exceeded" : "timeout exceeded";
      const transitional2 = _config.transitional || transitional_default;
      if (_config.timeoutErrorMessage) {
        timeoutErrorMessage = _config.timeoutErrorMessage;
      }
      reject(
        new AxiosError_default(
          timeoutErrorMessage,
          transitional2.clarifyTimeoutError ? AxiosError_default.ETIMEDOUT : AxiosError_default.ECONNABORTED,
          config,
          request
        )
      );
      request = null;
    };
    requestData === void 0 && requestHeaders.setContentType(null);
    if ("setRequestHeader" in request) {
      utils_default.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
        request.setRequestHeader(key, val);
      });
    }
    if (!utils_default.isUndefined(_config.withCredentials)) {
      request.withCredentials = !!_config.withCredentials;
    }
    if (responseType && responseType !== "json") {
      request.responseType = _config.responseType;
    }
    if (onDownloadProgress) {
      [downloadThrottled, flushDownload] = progressEventReducer(onDownloadProgress, true);
      request.addEventListener("progress", downloadThrottled);
    }
    if (onUploadProgress && request.upload) {
      [uploadThrottled, flushUpload] = progressEventReducer(onUploadProgress);
      request.upload.addEventListener("progress", uploadThrottled);
      request.upload.addEventListener("loadend", flushUpload);
    }
    if (_config.cancelToken || _config.signal) {
      onCanceled = (cancel) => {
        if (!request) {
          return;
        }
        reject(!cancel || cancel.type ? new CanceledError_default(null, config, request) : cancel);
        request.abort();
        request = null;
      };
      _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
      if (_config.signal) {
        _config.signal.aborted ? onCanceled() : _config.signal.addEventListener("abort", onCanceled);
      }
    }
    const protocol = parseProtocol(_config.url);
    if (protocol && platform_default.protocols.indexOf(protocol) === -1) {
      reject(
        new AxiosError_default(
          "Unsupported protocol " + protocol + ":",
          AxiosError_default.ERR_BAD_REQUEST,
          config
        )
      );
      return;
    }
    request.send(requestData || null);
  });
};

// node_modules/axios/lib/helpers/composeSignals.js
var composeSignals = (signals, timeout) => {
  const { length } = signals = signals ? signals.filter(Boolean) : [];
  if (timeout || length) {
    let controller = new AbortController();
    let aborted;
    const onabort = function(reason) {
      if (!aborted) {
        aborted = true;
        unsubscribe();
        const err = reason instanceof Error ? reason : this.reason;
        controller.abort(
          err instanceof AxiosError_default ? err : new CanceledError_default(err instanceof Error ? err.message : err)
        );
      }
    };
    let timer = timeout && setTimeout(() => {
      timer = null;
      onabort(new AxiosError_default(`timeout of ${timeout}ms exceeded`, AxiosError_default.ETIMEDOUT));
    }, timeout);
    const unsubscribe = () => {
      if (signals) {
        timer && clearTimeout(timer);
        timer = null;
        signals.forEach((signal2) => {
          signal2.unsubscribe ? signal2.unsubscribe(onabort) : signal2.removeEventListener("abort", onabort);
        });
        signals = null;
      }
    };
    signals.forEach((signal2) => signal2.addEventListener("abort", onabort));
    const { signal } = controller;
    signal.unsubscribe = () => utils_default.asap(unsubscribe);
    return signal;
  }
};
var composeSignals_default = composeSignals;

// node_modules/axios/lib/helpers/trackStream.js
var streamChunk = function* (chunk, chunkSize) {
  let len = chunk.byteLength;
  if (!chunkSize || len < chunkSize) {
    yield chunk;
    return;
  }
  let pos = 0;
  let end;
  while (pos < len) {
    end = pos + chunkSize;
    yield chunk.slice(pos, end);
    pos = end;
  }
};
var readBytes = async function* (iterable, chunkSize) {
  for await (const chunk of readStream(iterable)) {
    yield* streamChunk(chunk, chunkSize);
  }
};
var readStream = async function* (stream4) {
  if (stream4[Symbol.asyncIterator]) {
    yield* stream4;
    return;
  }
  const reader = stream4.getReader();
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield value;
    }
  } finally {
    await reader.cancel();
  }
};
var trackStream = (stream4, chunkSize, onProgress, onFinish) => {
  const iterator2 = readBytes(stream4, chunkSize);
  let bytes = 0;
  let done;
  let _onFinish = (e) => {
    if (!done) {
      done = true;
      onFinish && onFinish(e);
    }
  };
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          const { done: done2, value } = await iterator2.next();
          if (done2) {
            _onFinish();
            controller.close();
            return;
          }
          let len = value.byteLength;
          if (onProgress) {
            let loadedBytes = bytes += len;
            onProgress(loadedBytes);
          }
          controller.enqueue(new Uint8Array(value));
        } catch (err) {
          _onFinish(err);
          throw err;
        }
      },
      cancel(reason) {
        _onFinish(reason);
        return iterator2.return();
      }
    },
    {
      highWaterMark: 2
    }
  );
};

// node_modules/axios/lib/adapters/fetch.js
var DEFAULT_CHUNK_SIZE = 64 * 1024;
var { isFunction: isFunction2 } = utils_default;
var globalFetchAPI = (({ Request, Response }) => ({
  Request,
  Response
}))(utils_default.global);
var { ReadableStream: ReadableStream2, TextEncoder: TextEncoder2 } = utils_default.global;
var test = (fn, ...args) => {
  try {
    return !!fn(...args);
  } catch (e) {
    return false;
  }
};
var factory = (env) => {
  env = utils_default.merge.call(
    {
      skipUndefined: true
    },
    globalFetchAPI,
    env
  );
  const { fetch: envFetch, Request, Response } = env;
  const isFetchSupported = envFetch ? isFunction2(envFetch) : typeof fetch === "function";
  const isRequestSupported = isFunction2(Request);
  const isResponseSupported = isFunction2(Response);
  if (!isFetchSupported) {
    return false;
  }
  const isReadableStreamSupported = isFetchSupported && isFunction2(ReadableStream2);
  const encodeText = isFetchSupported && (typeof TextEncoder2 === "function" ? /* @__PURE__ */ ((encoder) => (str) => encoder.encode(str))(new TextEncoder2()) : async (str) => new Uint8Array(await new Request(str).arrayBuffer()));
  const supportsRequestStream = isRequestSupported && isReadableStreamSupported && test(() => {
    let duplexAccessed = false;
    const hasContentType = new Request(platform_default.origin, {
      body: new ReadableStream2(),
      method: "POST",
      get duplex() {
        duplexAccessed = true;
        return "half";
      }
    }).headers.has("Content-Type");
    return duplexAccessed && !hasContentType;
  });
  const supportsResponseStream = isResponseSupported && isReadableStreamSupported && test(() => utils_default.isReadableStream(new Response("").body));
  const resolvers = {
    stream: supportsResponseStream && ((res) => res.body)
  };
  isFetchSupported && (() => {
    ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((type) => {
      !resolvers[type] && (resolvers[type] = (res, config) => {
        let method = res && res[type];
        if (method) {
          return method.call(res);
        }
        throw new AxiosError_default(
          `Response type '${type}' is not supported`,
          AxiosError_default.ERR_NOT_SUPPORT,
          config
        );
      });
    });
  })();
  const getBodyLength = async (body) => {
    if (body == null) {
      return 0;
    }
    if (utils_default.isBlob(body)) {
      return body.size;
    }
    if (utils_default.isSpecCompliantForm(body)) {
      const _request = new Request(platform_default.origin, {
        method: "POST",
        body
      });
      return (await _request.arrayBuffer()).byteLength;
    }
    if (utils_default.isArrayBufferView(body) || utils_default.isArrayBuffer(body)) {
      return body.byteLength;
    }
    if (utils_default.isURLSearchParams(body)) {
      body = body + "";
    }
    if (utils_default.isString(body)) {
      return (await encodeText(body)).byteLength;
    }
  };
  const resolveBodyLength = async (headers, body) => {
    const length = utils_default.toFiniteNumber(headers.getContentLength());
    return length == null ? getBodyLength(body) : length;
  };
  return async (config) => {
    let {
      url: url2,
      method,
      data,
      signal,
      cancelToken,
      timeout,
      onDownloadProgress,
      onUploadProgress,
      responseType,
      headers,
      withCredentials = "same-origin",
      fetchOptions
    } = resolveConfig_default(config);
    let _fetch = envFetch || fetch;
    responseType = responseType ? (responseType + "").toLowerCase() : "text";
    let composedSignal = composeSignals_default(
      [signal, cancelToken && cancelToken.toAbortSignal()],
      timeout
    );
    let request = null;
    const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
      composedSignal.unsubscribe();
    });
    let requestContentLength;
    try {
      if (onUploadProgress && supportsRequestStream && method !== "get" && method !== "head" && (requestContentLength = await resolveBodyLength(headers, data)) !== 0) {
        let _request = new Request(url2, {
          method: "POST",
          body: data,
          duplex: "half"
        });
        let contentTypeHeader;
        if (utils_default.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) {
          headers.setContentType(contentTypeHeader);
        }
        if (_request.body) {
          const [onProgress, flush] = progressEventDecorator(
            requestContentLength,
            progressEventReducer(asyncDecorator(onUploadProgress))
          );
          data = trackStream(_request.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
        }
      }
      if (!utils_default.isString(withCredentials)) {
        withCredentials = withCredentials ? "include" : "omit";
      }
      const isCredentialsSupported = isRequestSupported && "credentials" in Request.prototype;
      const resolvedOptions = {
        ...fetchOptions,
        signal: composedSignal,
        method: method.toUpperCase(),
        headers: headers.normalize().toJSON(),
        body: data,
        duplex: "half",
        credentials: isCredentialsSupported ? withCredentials : void 0
      };
      request = isRequestSupported && new Request(url2, resolvedOptions);
      let response = await (isRequestSupported ? _fetch(request, fetchOptions) : _fetch(url2, resolvedOptions));
      const isStreamResponse = supportsResponseStream && (responseType === "stream" || responseType === "response");
      if (supportsResponseStream && (onDownloadProgress || isStreamResponse && unsubscribe)) {
        const options = {};
        ["status", "statusText", "headers"].forEach((prop) => {
          options[prop] = response[prop];
        });
        const responseContentLength = utils_default.toFiniteNumber(response.headers.get("content-length"));
        const [onProgress, flush] = onDownloadProgress && progressEventDecorator(
          responseContentLength,
          progressEventReducer(asyncDecorator(onDownloadProgress), true)
        ) || [];
        response = new Response(
          trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
            flush && flush();
            unsubscribe && unsubscribe();
          }),
          options
        );
      }
      responseType = responseType || "text";
      let responseData = await resolvers[utils_default.findKey(resolvers, responseType) || "text"](
        response,
        config
      );
      !isStreamResponse && unsubscribe && unsubscribe();
      return await new Promise((resolve, reject) => {
        settle(resolve, reject, {
          data: responseData,
          headers: AxiosHeaders_default.from(response.headers),
          status: response.status,
          statusText: response.statusText,
          config,
          request
        });
      });
    } catch (err) {
      unsubscribe && unsubscribe();
      if (err && err.name === "TypeError" && /Load failed|fetch/i.test(err.message)) {
        throw Object.assign(
          new AxiosError_default(
            "Network Error",
            AxiosError_default.ERR_NETWORK,
            config,
            request,
            err && err.response
          ),
          {
            cause: err.cause || err
          }
        );
      }
      throw AxiosError_default.from(err, err && err.code, config, request, err && err.response);
    }
  };
};
var seedCache = /* @__PURE__ */ new Map();
var getFetch = (config) => {
  let env = config && config.env || {};
  const { fetch: fetch2, Request, Response } = env;
  const seeds = [Request, Response, fetch2];
  let len = seeds.length, i = len, seed, target, map = seedCache;
  while (i--) {
    seed = seeds[i];
    target = map.get(seed);
    target === void 0 && map.set(seed, target = i ? /* @__PURE__ */ new Map() : factory(env));
    map = target;
  }
  return target;
};
var adapter = getFetch();

// node_modules/axios/lib/adapters/adapters.js
var knownAdapters = {
  http: http_default,
  xhr: xhr_default,
  fetch: {
    get: getFetch
  }
};
utils_default.forEach(knownAdapters, (fn, value) => {
  if (fn) {
    try {
      Object.defineProperty(fn, "name", { value });
    } catch (e) {
    }
    Object.defineProperty(fn, "adapterName", { value });
  }
});
var renderReason = (reason) => `- ${reason}`;
var isResolvedHandle = (adapter2) => utils_default.isFunction(adapter2) || adapter2 === null || adapter2 === false;
function getAdapter(adapters, config) {
  adapters = utils_default.isArray(adapters) ? adapters : [adapters];
  const { length } = adapters;
  let nameOrAdapter;
  let adapter2;
  const rejectedReasons = {};
  for (let i = 0; i < length; i++) {
    nameOrAdapter = adapters[i];
    let id;
    adapter2 = nameOrAdapter;
    if (!isResolvedHandle(nameOrAdapter)) {
      adapter2 = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
      if (adapter2 === void 0) {
        throw new AxiosError_default(`Unknown adapter '${id}'`);
      }
    }
    if (adapter2 && (utils_default.isFunction(adapter2) || (adapter2 = adapter2.get(config)))) {
      break;
    }
    rejectedReasons[id || "#" + i] = adapter2;
  }
  if (!adapter2) {
    const reasons = Object.entries(rejectedReasons).map(
      ([id, state]) => `adapter ${id} ` + (state === false ? "is not supported by the environment" : "is not available in the build")
    );
    let s = length ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
    throw new AxiosError_default(
      `There is no suitable adapter to dispatch the request ` + s,
      "ERR_NOT_SUPPORT"
    );
  }
  return adapter2;
}
var adapters_default = {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter,
  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: knownAdapters
};

// node_modules/axios/lib/core/dispatchRequest.js
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
  if (config.signal && config.signal.aborted) {
    throw new CanceledError_default(null, config);
  }
}
function dispatchRequest(config) {
  throwIfCancellationRequested(config);
  config.headers = AxiosHeaders_default.from(config.headers);
  config.data = transformData.call(config, config.transformRequest);
  if (["post", "put", "patch"].indexOf(config.method) !== -1) {
    config.headers.setContentType("application/x-www-form-urlencoded", false);
  }
  const adapter2 = adapters_default.getAdapter(config.adapter || defaults_default.adapter, config);
  return adapter2(config).then(
    function onAdapterResolution(response) {
      throwIfCancellationRequested(config);
      response.data = transformData.call(config, config.transformResponse, response);
      response.headers = AxiosHeaders_default.from(response.headers);
      return response;
    },
    function onAdapterRejection(reason) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);
        if (reason && reason.response) {
          reason.response.data = transformData.call(
            config,
            config.transformResponse,
            reason.response
          );
          reason.response.headers = AxiosHeaders_default.from(reason.response.headers);
        }
      }
      return Promise.reject(reason);
    }
  );
}

// node_modules/axios/lib/helpers/validator.js
var validators = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((type, i) => {
  validators[type] = function validator(thing) {
    return typeof thing === type || "a" + (i < 1 ? "n " : " ") + type;
  };
});
var deprecatedWarnings = {};
validators.transitional = function transitional(validator, version, message) {
  function formatMessage(opt, desc) {
    return "[Axios v" + VERSION + "] Transitional option '" + opt + "'" + desc + (message ? ". " + message : "");
  }
  return (value, opt, opts) => {
    if (validator === false) {
      throw new AxiosError_default(
        formatMessage(opt, " has been removed" + (version ? " in " + version : "")),
        AxiosError_default.ERR_DEPRECATED
      );
    }
    if (version && !deprecatedWarnings[opt]) {
      deprecatedWarnings[opt] = true;
      console.warn(
        formatMessage(
          opt,
          " has been deprecated since v" + version + " and will be removed in the near future"
        )
      );
    }
    return validator ? validator(value, opt, opts) : true;
  };
};
validators.spelling = function spelling(correctSpelling) {
  return (value, opt) => {
    console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
    return true;
  };
};
function assertOptions(options, schema, allowUnknown) {
  if (typeof options !== "object") {
    throw new AxiosError_default("options must be an object", AxiosError_default.ERR_BAD_OPTION_VALUE);
  }
  const keys = Object.keys(options);
  let i = keys.length;
  while (i-- > 0) {
    const opt = keys[i];
    const validator = schema[opt];
    if (validator) {
      const value = options[opt];
      const result = value === void 0 || validator(value, opt, options);
      if (result !== true) {
        throw new AxiosError_default(
          "option " + opt + " must be " + result,
          AxiosError_default.ERR_BAD_OPTION_VALUE
        );
      }
      continue;
    }
    if (allowUnknown !== true) {
      throw new AxiosError_default("Unknown option " + opt, AxiosError_default.ERR_BAD_OPTION);
    }
  }
}
var validator_default = {
  assertOptions,
  validators
};

// node_modules/axios/lib/core/Axios.js
var validators2 = validator_default.validators;
var Axios = class {
  constructor(instanceConfig) {
    this.defaults = instanceConfig || {};
    this.interceptors = {
      request: new InterceptorManager_default(),
      response: new InterceptorManager_default()
    };
  }
  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  async request(configOrUrl, config) {
    try {
      return await this._request(configOrUrl, config);
    } catch (err) {
      if (err instanceof Error) {
        let dummy = {};
        Error.captureStackTrace ? Error.captureStackTrace(dummy) : dummy = new Error();
        const stack = dummy.stack ? dummy.stack.replace(/^.+\n/, "") : "";
        try {
          if (!err.stack) {
            err.stack = stack;
          } else if (stack && !String(err.stack).endsWith(stack.replace(/^.+\n.+\n/, ""))) {
            err.stack += "\n" + stack;
          }
        } catch (e) {
        }
      }
      throw err;
    }
  }
  _request(configOrUrl, config) {
    if (typeof configOrUrl === "string") {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }
    config = mergeConfig(this.defaults, config);
    const { transitional: transitional2, paramsSerializer, headers } = config;
    if (transitional2 !== void 0) {
      validator_default.assertOptions(
        transitional2,
        {
          silentJSONParsing: validators2.transitional(validators2.boolean),
          forcedJSONParsing: validators2.transitional(validators2.boolean),
          clarifyTimeoutError: validators2.transitional(validators2.boolean),
          legacyInterceptorReqResOrdering: validators2.transitional(validators2.boolean)
        },
        false
      );
    }
    if (paramsSerializer != null) {
      if (utils_default.isFunction(paramsSerializer)) {
        config.paramsSerializer = {
          serialize: paramsSerializer
        };
      } else {
        validator_default.assertOptions(
          paramsSerializer,
          {
            encode: validators2.function,
            serialize: validators2.function
          },
          true
        );
      }
    }
    if (config.allowAbsoluteUrls !== void 0) {
    } else if (this.defaults.allowAbsoluteUrls !== void 0) {
      config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
    } else {
      config.allowAbsoluteUrls = true;
    }
    validator_default.assertOptions(
      config,
      {
        baseUrl: validators2.spelling("baseURL"),
        withXsrfToken: validators2.spelling("withXSRFToken")
      },
      true
    );
    config.method = (config.method || this.defaults.method || "get").toLowerCase();
    let contextHeaders = headers && utils_default.merge(headers.common, headers[config.method]);
    headers && utils_default.forEach(["delete", "get", "head", "post", "put", "patch", "common"], (method) => {
      delete headers[method];
    });
    config.headers = AxiosHeaders_default.concat(contextHeaders, headers);
    const requestInterceptorChain = [];
    let synchronousRequestInterceptors = true;
    this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
      if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) {
        return;
      }
      synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
      const transitional3 = config.transitional || transitional_default;
      const legacyInterceptorReqResOrdering = transitional3 && transitional3.legacyInterceptorReqResOrdering;
      if (legacyInterceptorReqResOrdering) {
        requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
      } else {
        requestInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      }
    });
    const responseInterceptorChain = [];
    this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
    });
    let promise;
    let i = 0;
    let len;
    if (!synchronousRequestInterceptors) {
      const chain = [dispatchRequest.bind(this), void 0];
      chain.unshift(...requestInterceptorChain);
      chain.push(...responseInterceptorChain);
      len = chain.length;
      promise = Promise.resolve(config);
      while (i < len) {
        promise = promise.then(chain[i++], chain[i++]);
      }
      return promise;
    }
    len = requestInterceptorChain.length;
    let newConfig = config;
    while (i < len) {
      const onFulfilled = requestInterceptorChain[i++];
      const onRejected = requestInterceptorChain[i++];
      try {
        newConfig = onFulfilled(newConfig);
      } catch (error) {
        onRejected.call(this, error);
        break;
      }
    }
    try {
      promise = dispatchRequest.call(this, newConfig);
    } catch (error) {
      return Promise.reject(error);
    }
    i = 0;
    len = responseInterceptorChain.length;
    while (i < len) {
      promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
    }
    return promise;
  }
  getUri(config) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
};
utils_default.forEach(["delete", "get", "head", "options"], function forEachMethodNoData(method) {
  Axios.prototype[method] = function(url2, config) {
    return this.request(
      mergeConfig(config || {}, {
        method,
        url: url2,
        data: (config || {}).data
      })
    );
  };
});
utils_default.forEach(["post", "put", "patch"], function forEachMethodWithData(method) {
  function generateHTTPMethod(isForm) {
    return function httpMethod(url2, data, config) {
      return this.request(
        mergeConfig(config || {}, {
          method,
          headers: isForm ? {
            "Content-Type": "multipart/form-data"
          } : {},
          url: url2,
          data
        })
      );
    };
  }
  Axios.prototype[method] = generateHTTPMethod();
  Axios.prototype[method + "Form"] = generateHTTPMethod(true);
});
var Axios_default = Axios;

// node_modules/axios/lib/cancel/CancelToken.js
var CancelToken = class _CancelToken {
  constructor(executor) {
    if (typeof executor !== "function") {
      throw new TypeError("executor must be a function.");
    }
    let resolvePromise;
    this.promise = new Promise(function promiseExecutor(resolve) {
      resolvePromise = resolve;
    });
    const token = this;
    this.promise.then((cancel) => {
      if (!token._listeners) return;
      let i = token._listeners.length;
      while (i-- > 0) {
        token._listeners[i](cancel);
      }
      token._listeners = null;
    });
    this.promise.then = (onfulfilled) => {
      let _resolve;
      const promise = new Promise((resolve) => {
        token.subscribe(resolve);
        _resolve = resolve;
      }).then(onfulfilled);
      promise.cancel = function reject() {
        token.unsubscribe(_resolve);
      };
      return promise;
    };
    executor(function cancel(message, config, request) {
      if (token.reason) {
        return;
      }
      token.reason = new CanceledError_default(message, config, request);
      resolvePromise(token.reason);
    });
  }
  /**
   * Throws a `CanceledError` if cancellation has been requested.
   */
  throwIfRequested() {
    if (this.reason) {
      throw this.reason;
    }
  }
  /**
   * Subscribe to the cancel signal
   */
  subscribe(listener) {
    if (this.reason) {
      listener(this.reason);
      return;
    }
    if (this._listeners) {
      this._listeners.push(listener);
    } else {
      this._listeners = [listener];
    }
  }
  /**
   * Unsubscribe from the cancel signal
   */
  unsubscribe(listener) {
    if (!this._listeners) {
      return;
    }
    const index = this._listeners.indexOf(listener);
    if (index !== -1) {
      this._listeners.splice(index, 1);
    }
  }
  toAbortSignal() {
    const controller = new AbortController();
    const abort = (err) => {
      controller.abort(err);
    };
    this.subscribe(abort);
    controller.signal.unsubscribe = () => this.unsubscribe(abort);
    return controller.signal;
  }
  /**
   * Returns an object that contains a new `CancelToken` and a function that, when called,
   * cancels the `CancelToken`.
   */
  static source() {
    let cancel;
    const token = new _CancelToken(function executor(c) {
      cancel = c;
    });
    return {
      token,
      cancel
    };
  }
};
var CancelToken_default = CancelToken;

// node_modules/axios/lib/helpers/spread.js
function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
}

// node_modules/axios/lib/helpers/isAxiosError.js
function isAxiosError(payload) {
  return utils_default.isObject(payload) && payload.isAxiosError === true;
}

// node_modules/axios/lib/helpers/HttpStatusCode.js
var HttpStatusCode = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  Unused: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
  WebServerIsDown: 521,
  ConnectionTimedOut: 522,
  OriginIsUnreachable: 523,
  TimeoutOccurred: 524,
  SslHandshakeFailed: 525,
  InvalidSslCertificate: 526
};
Object.entries(HttpStatusCode).forEach(([key, value]) => {
  HttpStatusCode[value] = key;
});
var HttpStatusCode_default = HttpStatusCode;

// node_modules/axios/lib/axios.js
function createInstance(defaultConfig) {
  const context = new Axios_default(defaultConfig);
  const instance = bind(Axios_default.prototype.request, context);
  utils_default.extend(instance, Axios_default.prototype, context, { allOwnKeys: true });
  utils_default.extend(instance, context, null, { allOwnKeys: true });
  instance.create = function create(instanceConfig) {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };
  return instance;
}
var axios = createInstance(defaults_default);
axios.Axios = Axios_default;
axios.CanceledError = CanceledError_default;
axios.CancelToken = CancelToken_default;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData_default;
axios.AxiosError = AxiosError_default;
axios.Cancel = axios.CanceledError;
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = spread;
axios.isAxiosError = isAxiosError;
axios.mergeConfig = mergeConfig;
axios.AxiosHeaders = AxiosHeaders_default;
axios.formToJSON = (thing) => formDataToJSON_default(utils_default.isHTMLForm(thing) ? new FormData(thing) : thing);
axios.getAdapter = adapters_default.getAdapter;
axios.HttpStatusCode = HttpStatusCode_default;
axios.default = axios;
var axios_default = axios;

// node_modules/axios/index.js
var {
  Axios: Axios2,
  AxiosError: AxiosError2,
  CanceledError: CanceledError2,
  isCancel: isCancel2,
  CancelToken: CancelToken2,
  VERSION: VERSION2,
  all: all2,
  Cancel,
  isAxiosError: isAxiosError2,
  spread: spread2,
  toFormData: toFormData2,
  AxiosHeaders: AxiosHeaders2,
  HttpStatusCode: HttpStatusCode2,
  formToJSON,
  getAdapter: getAdapter2,
  mergeConfig: mergeConfig2
} = axios_default;

// main.ts
var import_blueimp_md5 = __toESM(require_md5());
var import_os = require("os");

// crypto-e2ee.ts
var import_hash_wasm = __toESM(require_index_umd());
var WIRE_MAGIC = new Uint8Array([72, 83, 89, 78, 1]);
var ENCRYPTION_VERSION_WIRE = 1;
var ENVELOPE_VERSION = 1;
var ALGORITHM_LABEL = "AES-256-GCM";
var ARGON2_MEMORY_KIB = 65536;
var ARGON2_ITERATIONS = 3;
var ARGON2_PARALLELISM = 4;
var ARGON2_HASH_LEN = 32;
function normalizeBindingCode(raw) {
  return raw.normalize("NFKC").trim();
}
function bytesToBase64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlToBytes(s) {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad !== 0) throw new Error("E2EE_BASE64URL_INVALID");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256HexOfBytes(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(new Uint8Array(digest));
}
function bufferToHex(b) {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function randomBytes(n) {
  const u = new Uint8Array(n);
  crypto.getRandomValues(u);
  return u;
}
async function deriveKek(bindingCodeNormalized, salt, kekDerivationVersion) {
  if (!bindingCodeNormalized) {
    throw new Error("E2EE_BINDING_CODE_EMPTY");
  }
  if (kekDerivationVersion !== 1) {
    throw new Error(`E2EE_KEK_VERSION_UNSUPPORTED:${kekDerivationVersion}`);
  }
  const out = await (0, import_hash_wasm.argon2id)({
    password: bindingCodeNormalized,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: ARGON2_HASH_LEN,
    outputType: "binary"
  });
  return new Uint8Array(out);
}
async function importAesKey(raw) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
}
async function wrapVaultKeyToEnvelope(vaultKey, kek, kekDerivationVersion, kekSalt, vaultKeyVersion) {
  if (vaultKey.length !== 32) throw new Error("E2EE_VAULT_KEY_LEN");
  const iv = randomBytes(12);
  const key = await importAesKey(kek);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new Uint8Array(0) },
    key,
    vaultKey
  );
  const full = new Uint8Array(ctBuf);
  const tag = full.slice(-16);
  const ciphertext = full.slice(0, -16);
  return {
    envelope_version: ENVELOPE_VERSION,
    algorithm: ALGORITHM_LABEL,
    kek_derivation_version: kekDerivationVersion,
    kek_salt: bytesToBase64url(kekSalt),
    iv: bytesToBase64url(iv),
    ciphertext: bytesToBase64url(ciphertext),
    tag: bytesToBase64url(tag),
    vault_key_version: vaultKeyVersion
  };
}
async function unwrapVaultKeyFromEnvelope(envelope, bindingCodeNormalized) {
  if (!bindingCodeNormalized) {
    throw new Error("E2EE_BINDING_CODE_EMPTY");
  }
  if (envelope.envelope_version !== ENVELOPE_VERSION) {
    throw new Error(`E2EE_ENVELOPE_VERSION:${envelope.envelope_version}`);
  }
  if (envelope.algorithm !== ALGORITHM_LABEL) {
    throw new Error(`E2EE_ENVELOPE_ALGORITHM:${envelope.algorithm}`);
  }
  const salt = base64urlToBytes(envelope.kek_salt);
  const kek = await deriveKek(bindingCodeNormalized, salt, envelope.kek_derivation_version);
  const iv = base64urlToBytes(envelope.iv);
  const ciphertext = base64urlToBytes(envelope.ciphertext);
  const tag = base64urlToBytes(envelope.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const key = await importAesKey(kek);
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new Uint8Array(0) },
      key,
      combined
    );
  } catch {
    throw new Error("E2EE_ENVELOPE_DECRYPT_FAILED");
  }
  const vk = new Uint8Array(plain);
  if (vk.length !== 32) throw new Error("E2EE_VAULT_KEY_UNWRAP_LEN");
  return vk;
}
function utf8Enc(s) {
  return new TextEncoder().encode(s);
}
async function encryptPlainToWire(plain, relativePath, vaultKey, vaultKeyVersion) {
  if (plain.length > 4294967295) throw new Error("E2EE_PLAIN_TOO_LARGE");
  const nonce = randomBytes(12);
  const aad = utf8Enc(relativePath);
  const key = await importAesKey(vaultKey);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad },
    key,
    plain
  );
  const full = new Uint8Array(ctBuf);
  const tag = full.slice(-16);
  const ciphertext = full.slice(0, -16);
  const headerLen = WIRE_MAGIC.length + 2 + 4 + 12 + 4;
  const out = new Uint8Array(headerLen + ciphertext.length + 16);
  let o = 0;
  out.set(WIRE_MAGIC, o);
  o += WIRE_MAGIC.length;
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint16(o, ENCRYPTION_VERSION_WIRE, false);
  o += 2;
  dv.setUint32(o, vaultKeyVersion >>> 0, false);
  o += 4;
  out.set(nonce, o);
  o += 12;
  dv.setUint32(o, plain.length >>> 0, false);
  o += 4;
  out.set(ciphertext, o);
  o += ciphertext.length;
  out.set(tag, o);
  return out;
}
async function decryptWireToPlain(wire, relativePath, vaultKey) {
  if (wire.length < WIRE_MAGIC.length + 2 + 4 + 12 + 4 + 16) {
    throw new Error("E2EE_WIRE_TRUNCATED");
  }
  for (let i = 0; i < WIRE_MAGIC.length; i++) {
    if (wire[i] !== WIRE_MAGIC[i]) throw new Error("E2EE_WIRE_MAGIC");
  }
  let o = WIRE_MAGIC.length;
  const dv = new DataView(wire.buffer, wire.byteOffset, wire.byteLength);
  const encVer = dv.getUint16(o, false);
  o += 2;
  if (encVer !== ENCRYPTION_VERSION_WIRE) throw new Error(`E2EE_WIRE_ENC_VERSION:${encVer}`);
  const vaultKeyVersion = dv.getUint32(o, false);
  o += 4;
  const nonce = wire.slice(o, o + 12);
  o += 12;
  const plainSize = dv.getUint32(o, false);
  o += 4;
  const rest = wire.length - o;
  if (rest < 16) throw new Error("E2EE_WIRE_TAG_MISSING");
  const ciphertext = wire.slice(o, o + rest - 16);
  const tag = wire.slice(o + rest - 16, o + rest);
  if (ciphertext.length + tag.length + o !== wire.length) throw new Error("E2EE_WIRE_LAYOUT");
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const aad = utf8Enc(relativePath);
  const key = await importAesKey(vaultKey);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad },
      key,
      combined
    );
    const out = new Uint8Array(plain);
    if (out.length !== plainSize) throw new Error("E2EE_WIRE_PLAINSIZE_MISMATCH");
    return out;
  } catch {
    throw new Error("E2EE_WIRE_DECRYPT_FAILED");
  }
}
function assertEnvelopeShape(e) {
  if (!isPlainObject2(e)) throw new Error("E2EE_ENVELOPE_SHAPE");
  const o = e;
  const need = [
    "envelope_version",
    "algorithm",
    "kek_derivation_version",
    "kek_salt",
    "iv",
    "ciphertext",
    "tag",
    "vault_key_version"
  ];
  for (const k of need) {
    if (!(k in o)) throw new Error(`E2EE_ENVELOPE_MISSING:${k}`);
  }
}
function isPlainObject2(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// main.ts
var SYNC_META_FILENAME = ".sync_meta.json";
var SYNC_CONFIG_FILENAME = ".sync_config.json";
var SYNC_CRYPTO_FILENAME = ".sync_crypto.json";
async function ensureVaultFoldersForPath(vault, filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) return;
  const folderPath = normalized.slice(0, lastSlash);
  const segments = folderPath.split("/").filter(Boolean);
  let acc = "";
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    const existing = vault.getAbstractFileByPath(acc);
    if (!existing) {
      await vault.createFolder(acc);
    }
  }
}
function normalizeVaultPath(p) {
  if (!p) return p;
  const s = p.replace(/\\/g, "/");
  return s.split("/").filter((seg) => seg !== "" && seg !== ".").join("/");
}
function shouldSync(filePath) {
  if (!filePath) return false;
  const p = normalizeVaultPath(filePath);
  if (p.startsWith(".")) return false;
  if (p.includes(".obsidian")) return false;
  if (p === SYNC_META_FILENAME || p.endsWith(`/${SYNC_META_FILENAME}`)) return false;
  if (p === SYNC_CONFIG_FILENAME || p.endsWith(`/${SYNC_CONFIG_FILENAME}`)) return false;
  if (p === SYNC_CRYPTO_FILENAME || p.endsWith(`/${SYNC_CRYPTO_FILENAME}`)) return false;
  return true;
}
function isPlainObjectRecord(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}
function parseRemoteFilesItems(parsed) {
  if (!isPlainObjectRecord(parsed)) throw new Error("/files \u54CD\u5E94\u5FC5\u987B\u4E3A JSON \u5BF9\u8C61");
  const items = parsed.items;
  if (!Array.isArray(items)) throw new Error("/files \u5FC5\u987B\u4E3A { items: array }");
  const out = {};
  for (let i = 0; i < items.length; i++) {
    const rawItem = items[i];
    if (!isPlainObjectRecord(rawItem)) {
      throw new Error(`/files items[${i}] \u5FC5\u987B\u4E3A\u5BF9\u8C61`);
    }
    const rp = rawItem.relative_path;
    if (typeof rp !== "string" || !rp.trim()) {
      throw new Error("/files \u67D0\u9879\u7F3A\u5C11 relative_path");
    }
    const path = normalizeVaultPath(rp);
    if (!shouldSync(path)) continue;
    const updatedRaw = rawItem.updated_at;
    const updated_at = typeof updatedRaw === "number" && Number.isFinite(updatedRaw) ? updatedRaw : typeof updatedRaw === "string" && updatedRaw.trim() !== "" ? Number(updatedRaw) : NaN;
    if (!Number.isFinite(updated_at)) {
      throw new Error(`/files ${path} updated_at \u65E0\u6548`);
    }
    const ev = rawItem.encryption_version;
    const vv = rawItem.vault_key_version;
    if (typeof ev !== "number" || !Number.isFinite(ev)) {
      throw new Error(`/files ${path} encryption_version \u65E0\u6548`);
    }
    if (typeof vv !== "number" || !Number.isFinite(vv)) {
      throw new Error(`/files ${path} vault_key_version \u65E0\u6548`);
    }
    const deleted = rawItem.deleted === true;
    if (deleted) {
      if (rawItem.cipher_hash !== null) {
        throw new Error(`/files ${path} deleted=true \u65F6 cipher_hash \u987B\u4E3A null`);
      }
      if (rawItem.cipher_size !== null) {
        throw new Error(`/files ${path} deleted=true \u65F6 cipher_size \u987B\u4E3A null`);
      }
      out[path] = {
        cipher_hash: null,
        cipher_size: null,
        updated_at,
        deleted: true,
        encryption_version: ev,
        vault_key_version: vv,
        plain_fingerprint: ""
      };
      continue;
    }
    const ch = rawItem.cipher_hash;
    const cs = rawItem.cipher_size;
    if (typeof ch !== "string" || !ch.trim()) {
      throw new Error(`/files ${path} \u7F3A\u5C11 cipher_hash`);
    }
    if (typeof cs !== "number" || !Number.isFinite(cs)) {
      throw new Error(`/files ${path} cipher_size \u65E0\u6548`);
    }
    out[path] = {
      cipher_hash: ch.trim().toLowerCase(),
      cipher_size: cs,
      updated_at,
      deleted: false,
      encryption_version: ev,
      vault_key_version: vv,
      plain_fingerprint: ""
    };
  }
  return out;
}
var BUILTIN_DEFAULT_SERVER_URL = "http://120.77.77.185:3000";
var BINDING_CODE_SHOW_MS = 2e4;
var BINDING_COPY_FEEDBACK_MS = 2500;
function getDeviceTypeLabel() {
  const p = (0, import_os.platform)();
  if (p === "win32") return "windows";
  if (p === "darwin") return "mac";
  if (p === "linux") return "linux";
  return p || "unknown";
}
function getDeviceDisplayName() {
  try {
    const h = (0, import_os.hostname)();
    if (h && typeof h === "string" && h.trim()) return h.trim();
  } catch {
  }
  return "Obsidian";
}
function formatDeviceTypeForUi(raw) {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return "\u2014";
  const s = t.toLowerCase();
  const map = {
    windows: "Windows",
    mac: "Mac",
    ios: "iOS",
    android: "Android"
  };
  if (map[s]) return map[s];
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
function maskBindingCode(code) {
  const s = code.trim();
  if (!s) return "";
  const parts = s.split("-").filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]}-****-${parts[parts.length - 1]}`;
  }
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}-****-${s.slice(-4)}`;
}
function extractBindingCodeFromJson(data) {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!isPlainObjectRecord(data)) return null;
  const c = data.binding_code;
  if (typeof c === "string" && c.trim()) return c.trim();
  return null;
}
function parseDevicesListPayload(data) {
  const rows = [];
  let arr = [];
  if (isPlainObjectRecord(data)) {
    const list = data.devices;
    if (Array.isArray(list)) arr = list;
  }
  for (const item of arr) {
    if (!isPlainObjectRecord(item)) continue;
    const id = item.device_id;
    if (typeof id !== "string" || !id.trim()) continue;
    const name = item.device_name ?? "";
    const typ = item.device_type ?? "";
    const la = item.last_active_at ?? item["last_seen_at"];
    let lastAt = null;
    if (typeof la === "number" && Number.isFinite(la)) lastAt = la;
    else if (typeof la === "string" && la.trim() !== "") {
      const n = Number(la);
      if (Number.isFinite(n)) lastAt = n;
    }
    rows.push({
      device_id: id.trim(),
      device_name: typeof name === "string" ? name : String(name),
      device_type: typeof typ === "string" ? typ : String(typ),
      last_active_at: lastAt
    });
  }
  return rows;
}
function isDeviceRevokedError(err) {
  if (!isAxiosError2(err)) return false;
  const data = err.response?.data;
  if (isPlainObjectRecord(data) && typeof data.error === "string") {
    return data.error === "DEVICE_REVOKED";
  }
  if (typeof data === "string" && data.trim()) {
    try {
      const parsed = JSON.parse(data.trim());
      if (isPlainObjectRecord(parsed) && typeof parsed.error === "string") {
        return parsed.error === "DEVICE_REVOKED";
      }
    } catch {
    }
  }
  return false;
}
function isNetworkError(err) {
  if (!isAxiosError2(err)) return false;
  if (err.code === "ECONNABORTED") return true;
  if (typeof err.message === "string" && /timeout/i.test(err.message)) return true;
  if (!err.response) return true;
  return false;
}
var DEFAULT_SETTINGS = {
  serverUrl: BUILTIN_DEFAULT_SERVER_URL,
  enableSync: true
};
function formatRelativeTimeShort(ts) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1e3);
  if (sec < 0) return "\u521A\u521A";
  if (sec < 10) return "\u521A\u521A";
  if (sec < 60) return `${sec} \u79D2\u524D`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} \u5206\u949F\u524D`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} \u5C0F\u65F6\u524D`;
  const d = new Date(ts);
  const yesterday = /* @__PURE__ */ new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
    return `\u6628\u5929 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return d.toLocaleString();
}
function formatDeviceLastActive(ts) {
  return formatRelativeTimeShort(ts);
}
function humanizeKnownUploadErrorText(raw) {
  const t = raw.trim();
  const l = t.toLowerCase();
  if (l.includes("file required")) {
    return "\u4E0A\u4F20\u5931\u8D25\uFF1A\u7F3A\u5C11\u6587\u4EF6\uFF08\u8868\u5355\u5B57\u6BB5 file \u5FC5\u586B\uFF09";
  }
  if (l.includes("path required") || l.includes("relative_path")) {
    return "\u4E0A\u4F20\u5931\u8D25\uFF1A\u7F3A\u5C11\u8DEF\u5F84\uFF08\u8868\u5355\u5B57\u6BB5 relative_path \u5FC5\u586B\uFF09";
  }
  if (l.includes("invalid upload")) {
    return "\u4E0A\u4F20\u5931\u8D25\uFF1A\u65E0\u6548\u7684\u4E0A\u4F20\uFF08\u8BF7\u68C0\u67E5 file\u3001relative_path\u3001cipher_hash\u3001updated_at \u7B49\u5B57\u6BB5\uFF09";
  }
  return t;
}
function httpResponseBodyToArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const v = data;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
  }
  throw new Error("\u4E0B\u8F7D\u54CD\u5E94 body \u65E0\u6CD5\u8F6C\u4E3A ArrayBuffer");
}
function assertDownloadWireResponse(data, contentType) {
  const head = new Uint8Array(data.byteLength === 0 ? data : data.slice(0, Math.min(400, data.byteLength)));
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    throw new Error("\u4E0B\u8F7D Content-Type \u4E3A application/json\uFF0C\u671F\u671B application/octet-stream \u5BC6\u6587");
  }
  if (ct.includes("text/")) {
    const s = new TextDecoder("utf-8", { fatal: false }).decode(head);
    if (s.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(s.trim());
        if (isPlainObjectRecord(parsed)) {
          const urlKeys = ["url", "downloadUrl", "signedUrl", "download_url", "fileUrl"];
          for (const k of urlKeys) {
            const v = parsed[k];
            if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
              throw new Error("\u670D\u52A1\u7AEF\u8FD4\u56DE JSON \u94FE\u63A5\u800C\u975E\u5BC6\u6587");
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("\u670D\u52A1\u7AEF\u8FD4\u56DE")) throw e;
      }
    }
  }
  if (data.byteLength < 5) throw new Error("\u4E0B\u8F7D\u5BC6\u6587\u8FC7\u77ED");
  const magic = [72, 83, 89, 78, 1];
  for (let i = 0; i < 5; i++) {
    if (head[i] !== magic[i]) throw new Error("\u4E0B\u8F7D\u4F53\u4E0D\u662F\u6709\u6548\u5BC6\u6587 wire\uFF08\u9B54\u6570\u4E0D\u5339\u914D\uFF09");
  }
}
var HTTP_TIMEOUT_MS = 12e3;
var HTTP_TRANSFER_TIMEOUT_MS = 12e4;
var AXIOS_TIMEOUT_DEFAULTS = { timeout: HTTP_TIMEOUT_MS };
var AXIOS_LARGE_FILE_DEFAULTS = {
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
  timeout: HTTP_TRANSFER_TIMEOUT_MS
};
function formatSyncError(err) {
  if (isAxiosError2(err)) {
    if (err.response?.status === 413) {
      return "\u6587\u4EF6\u8FC7\u5927\uFF0C\u5DF2\u8D85\u8FC7\u670D\u52A1\u7AEF\u5141\u8BB8\u7684\u5927\u5C0F\u9650\u5236";
    }
    if (err.response?.status === 404) {
      return "\u8D44\u6E90\u4E0D\u5B58\u5728 (HTTP 404)";
    }
    const data = err.response?.data;
    if (data instanceof ArrayBuffer && data.byteLength > 0 && data.byteLength <= 4096) {
      const s = new TextDecoder("utf-8", { fatal: false }).decode(data);
      const t = s.trim();
      if (t.startsWith("{")) {
        try {
          const parsed = JSON.parse(t);
          if (isPlainObjectRecord(parsed)) {
            const msg = parsed.message;
            if (typeof msg === "string" && msg.trim()) return humanizeKnownUploadErrorText(msg.trim());
            const errMsg = parsed.error;
            if (typeof errMsg === "string" && errMsg.trim())
              return humanizeKnownUploadErrorText(errMsg.trim());
          }
        } catch {
        }
      }
    }
    if (typeof data === "string" && data.trim()) {
      const s = data.trim();
      try {
        const parsed = JSON.parse(s);
        if (isPlainObjectRecord(parsed)) {
          const msg = parsed.message;
          if (typeof msg === "string" && msg.trim())
            return humanizeKnownUploadErrorText(msg.trim());
          const errMsg = parsed.error;
          if (typeof errMsg === "string" && errMsg.trim())
            return humanizeKnownUploadErrorText(errMsg.trim());
        }
      } catch {
      }
      if (s.length <= 200) return humanizeKnownUploadErrorText(s);
    }
    if (isPlainObjectRecord(data)) {
      const msg = data.message;
      if (typeof msg === "string" && msg.trim())
        return humanizeKnownUploadErrorText(msg.trim());
      const errMsg = data.error;
      if (typeof errMsg === "string" && errMsg.trim())
        return humanizeKnownUploadErrorText(errMsg.trim());
    }
    const parts = [];
    if (err.code) parts.push(err.code);
    if (err.response?.status) parts.push(`HTTP ${err.response.status}`);
    if (err.message) parts.push(err.message);
    return parts.length > 0 ? parts.join(" \xB7 ") : "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25";
  }
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}
var HailySyncSettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  maskedBindingText = "";
  revealedFullCode = null;
  revealExpireAt = null;
  bindingError = null;
  bindingCopyFeedback = null;
  bindingPanelEl = null;
  bindingCountdownInterval = null;
  bindingHideTimeout = null;
  bindingCopyFeedbackTimeout = null;
  deviceListEl = null;
  devices = [];
  devicesError = null;
  devicesLoading = false;
  /** 点击「显示」后的提示文案 */
  revealHint = null;
  syncStatusTicker = null;
  syncStatusContainerEl = null;
  debugIdentityEl = null;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.plugin.register(() => this.clearBindingTimers());
    this.plugin.register(() => this.clearSyncStatusTicker());
  }
  clearBindingTimers() {
    if (this.bindingCountdownInterval != null) {
      window.clearInterval(this.bindingCountdownInterval);
      this.bindingCountdownInterval = null;
    }
    if (this.bindingHideTimeout != null) {
      window.clearTimeout(this.bindingHideTimeout);
      this.bindingHideTimeout = null;
    }
    if (this.bindingCopyFeedbackTimeout != null) {
      window.clearTimeout(this.bindingCopyFeedbackTimeout);
      this.bindingCopyFeedbackTimeout = null;
    }
  }
  clearSyncStatusTicker() {
    if (this.syncStatusTicker != null) {
      window.clearInterval(this.syncStatusTicker);
      this.syncStatusTicker = null;
    }
  }
  hide() {
    this.clearSyncStatusTicker();
    this.syncStatusContainerEl = null;
    this.debugIdentityEl = null;
  }
  fillDebugIdentity() {
    const el = this.debugIdentityEl;
    if (!el) return;
    el.empty();
    el.createEl("div", {
      cls: "setting-item-description",
      text: `\u7528\u6237 ID\uFF1A${this.plugin.userId || "\u2014"}`
    });
    el.createEl("div", {
      cls: "setting-item-description",
      text: `\u8BBE\u5907 ID\uFF1A${this.plugin.deviceId || "\u2014"}`
    });
    el.createEl("div", {
      cls: "setting-item-description",
      text: `\u5F53\u524D\u670D\u52A1\u5668\u5730\u5740\uFF1A${this.plugin.baseUrl || "\u2014"}`
    });
  }
  refreshSyncStatusPanel() {
    if (this.syncStatusContainerEl) this.fillSyncStatusSection(this.syncStatusContainerEl);
  }
  fillSyncStatusSection(el) {
    el.empty();
    const wasRevoked = this.plugin.wasRevoked;
    const syncing = this.plugin.isSyncing;
    const st = this.plugin.connectionState;
    if (wasRevoked) {
      el.createEl("div", { cls: "vault-sync-status-line", text: "\u5F53\u524D\u8BBE\u5907\u5DF2\u88AB\u79FB\u9664" });
      el.createEl("div", {
        cls: "setting-item-description",
        text: "\u8BF7\u5728\u4E0B\u65B9\u300C\u7ED1\u5B9A\u65B0\u8BBE\u5907\u300D\u4E2D\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u540C\u6B65\u3002"
      });
      return;
    }
    if (st === "awaiting_bind") {
      el.createEl("div", { cls: "vault-sync-status-line", text: "\u672A\u8FDE\u63A5" });
      el.createEl("div", {
        cls: "setting-item-description",
        text: "\u8BF7\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u8FDE\u63A5\u5E76\u5F00\u59CB\u540C\u6B65\u3002"
      });
      return;
    }
    if (st === "initializing") {
      el.createEl("div", { cls: "vault-sync-status-line", text: "\u6B63\u5728\u521D\u59CB\u5316\u2026" });
      return;
    }
    if (!this.plugin.deviceId) {
      el.createEl("div", { cls: "vault-sync-status-line", text: "\u672A\u8FDE\u63A5" });
      el.createEl("div", {
        cls: "setting-item-description",
        text: "\u5B8C\u6210\u8BBE\u5907\u7ED1\u5B9A\u540E\u5373\u53EF\u5F00\u59CB\u540C\u6B65\u3002"
      });
      return;
    }
    if (syncing) {
      el.createEl("div", { cls: "vault-sync-status-line", text: "\u6B63\u5728\u540C\u6B65\u2026" });
      el.createEl("div", {
        cls: "setting-item-description",
        text: this.plugin.lastSyncAt != null ? `\u6700\u8FD1\u540C\u6B65\uFF1A${formatRelativeTimeShort(this.plugin.lastSyncAt)}` : "\u6700\u8FD1\u540C\u6B65\uFF1A\u5C1A\u672A\u540C\u6B65"
      });
      return;
    }
    if (this.plugin.lastSyncError) {
      el.createEl("div", {
        cls: "vault-sync-status-line",
        text: "\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5"
      });
      if (this.plugin.lastSyncAt != null) {
        el.createEl("div", {
          cls: "setting-item-description",
          text: `\u6700\u8FD1\u540C\u6B65\uFF1A${formatRelativeTimeShort(this.plugin.lastSyncAt)}`
        });
      }
      return;
    }
    if (this.devicesLoading) {
      el.createEl("div", { cls: "vault-sync-status-line", text: "\u6B63\u5728\u52A0\u8F7D\u8BBE\u5907\u4FE1\u606F\u2026" });
      return;
    }
    el.createEl("div", { cls: "vault-sync-status-line", text: "\u540C\u6B65\u8FD0\u884C\u6B63\u5E38" });
    if (this.plugin.lastSyncAt != null) {
      el.createEl("div", {
        cls: "setting-item-description",
        text: `\u6700\u8FD1\u540C\u6B65\uFF1A${formatRelativeTimeShort(this.plugin.lastSyncAt)}`
      });
    } else {
      el.createEl("div", {
        cls: "setting-item-description",
        text: "\u6700\u8FD1\u540C\u6B65\uFF1A\u5C1A\u672A\u540C\u6B65"
      });
    }
    if (this.devices.length < 2) {
      el.createEl("div", {
        cls: "vault-sync-guide-sub",
        text: "\u5728\u53E6\u4E00\u53F0\u8BBE\u5907\u6253\u5F00\u672C\u63D2\u4EF6\u5E76\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\uFF0C\u5373\u53EF\u6DFB\u52A0\u8BBE\u5907\u3002"
      });
      const btnRow = el.createDiv({ cls: "vault-sync-guide-actions" });
      const btn = btnRow.createEl("button", {
        cls: "mod-cta",
        text: "\u590D\u5236\u8BBE\u5907\u7ED1\u5B9A\u7801"
      });
      btn.type = "button";
      btn.addEventListener("click", () => {
        void this.copyFullBindingCode();
      });
    }
  }
  syncRevealExpiry() {
    if (this.revealedFullCode && this.revealExpireAt != null && Date.now() >= this.revealExpireAt) {
      this.revealedFullCode = null;
      this.revealExpireAt = null;
      this.revealHint = null;
    }
  }
  renderBindingPanel() {
    const panel = this.bindingPanelEl;
    if (!panel) return;
    panel.empty();
    if (this.bindingError) {
      panel.createEl("div", {
        cls: "setting-item-description vault-sync-binding-error",
        text: this.bindingError
      });
    }
    if (this.bindingCopyFeedback) {
      panel.createEl("div", {
        cls: "setting-item-description vault-sync-binding-copy-ok",
        text: this.bindingCopyFeedback
      });
    }
    if (this.revealHint) {
      panel.createEl("div", {
        cls: "setting-item-description vault-sync-binding-reveal-hint",
        text: this.revealHint
      });
    }
    this.syncRevealExpiry();
    if (this.revealedFullCode && this.revealExpireAt != null && Date.now() < this.revealExpireAt) {
      const row = panel.createDiv({ cls: "vault-sync-binding-code-row" });
      row.createSpan({ cls: "vault-sync-binding-code-label", text: "\u5B8C\u6574\u7ED1\u5B9A\u7801" });
      row.createSpan({
        cls: "vault-sync-binding-code vault-sync-binding-code-full",
        text: this.revealedFullCode
      });
      const sec = Math.max(0, Math.ceil((this.revealExpireAt - Date.now()) / 1e3));
      row.createSpan({
        cls: "vault-sync-binding-countdown",
        text: `\uFF08${sec} \u79D2\u540E\u81EA\u52A8\u9690\u85CF\uFF09`
      });
    } else {
      const maskedWrap = panel.createDiv({ cls: "vault-sync-binding-masked-wrap" });
      maskedWrap.createSpan({ cls: "vault-sync-binding-code-label", text: "\u8BBE\u5907\u7ED1\u5B9A\u7801" });
      maskedWrap.createDiv({
        cls: "vault-sync-binding-code vault-sync-binding-code-masked",
        text: this.maskedBindingText || "\u2014"
      });
    }
  }
  scheduleRevealHide() {
    if (!this.revealedFullCode || this.revealExpireAt == null) return;
    const remain = this.revealExpireAt - Date.now();
    if (remain <= 0) {
      this.revealedFullCode = null;
      this.revealExpireAt = null;
      this.renderBindingPanel();
      return;
    }
    this.bindingHideTimeout = window.setTimeout(() => {
      this.bindingHideTimeout = null;
      this.revealedFullCode = null;
      this.revealExpireAt = null;
      this.revealHint = null;
      if (this.bindingCountdownInterval != null) {
        window.clearInterval(this.bindingCountdownInterval);
        this.bindingCountdownInterval = null;
      }
      this.renderBindingPanel();
    }, remain);
    this.bindingCountdownInterval = window.setInterval(() => {
      this.syncRevealExpiry();
      if (!this.revealedFullCode) {
        this.clearBindingTimers();
        this.renderBindingPanel();
        return;
      }
      this.renderBindingPanel();
    }, 1e3);
  }
  async refreshBindingMaskOnly() {
    const code = await this.plugin.fetchBindingCodeRaw();
    this.maskedBindingText = code ? maskBindingCode(code) : "";
  }
  async onShowReveal() {
    if (!this.plugin.deviceId) {
      new import_obsidian.Notice("\u8BF7\u5148\u5B8C\u6210\u8FDE\u63A5\u540E\u518D\u8BD5");
      return;
    }
    this.clearBindingTimers();
    this.bindingError = null;
    const code = await this.plugin.fetchBindingCodeRaw();
    if (!code) {
      this.bindingError = "\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u7ED1\u5B9A\u7801\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5";
      this.renderBindingPanel();
      return;
    }
    this.revealedFullCode = code;
    this.revealExpireAt = Date.now() + BINDING_CODE_SHOW_MS;
    this.revealHint = "\u6B63\u5728\u663E\u793A\u5B8C\u6574\u7ED1\u5B9A\u7801\uFF0C20 \u79D2\u540E\u81EA\u52A8\u9690\u85CF";
    this.renderBindingPanel();
    this.scheduleRevealHide();
  }
  async copyFullBindingCode() {
    if (!this.plugin.deviceId) {
      new import_obsidian.Notice("\u8BF7\u5148\u5B8C\u6210\u8FDE\u63A5\u540E\u518D\u8BD5");
      return;
    }
    const code = await this.plugin.fetchBindingCodeRaw();
    if (!code) {
      this.bindingError = "\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u7ED1\u5B9A\u7801\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5";
      this.renderBindingPanel();
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      new import_obsidian.Notice("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
      this.bindingCopyFeedback = "\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F";
      if (this.bindingCopyFeedbackTimeout != null) {
        window.clearTimeout(this.bindingCopyFeedbackTimeout);
      }
      this.bindingCopyFeedbackTimeout = window.setTimeout(() => {
        this.bindingCopyFeedbackTimeout = null;
        this.bindingCopyFeedback = null;
        this.renderBindingPanel();
      }, BINDING_COPY_FEEDBACK_MS);
      this.bindingError = null;
      this.renderBindingPanel();
    } catch {
      this.bindingCopyFeedback = null;
      this.bindingError = "\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC";
      this.renderBindingPanel();
    }
  }
  async onResetBinding() {
    if (!this.plugin.deviceId) {
      new import_obsidian.Notice("\u8BF7\u5148\u5B8C\u6210\u8FDE\u63A5\u540E\u518D\u8BD5");
      return;
    }
    if (!window.confirm(
      "\u91CD\u7F6E\u540E\uFF0C\u65E7\u7684\u8BBE\u5907\u7ED1\u5B9A\u7801\u5C06\u7ACB\u5373\u5931\u6548\uFF0C\u5176\u4ED6\u8BBE\u5907\u9700\u4F7F\u7528\u65B0\u7ED1\u5B9A\u7801\u624D\u80FD\u7EE7\u7EED\u8FDE\u63A5\u3002\n\n\u786E\u5B9A\u8981\u91CD\u7F6E\u5417\uFF1F"
    )) {
      return;
    }
    this.clearBindingTimers();
    this.revealedFullCode = null;
    this.revealExpireAt = null;
    this.bindingError = null;
    const ok = await this.plugin.resetBindingCodeOnServer();
    if (ok) {
      await this.refreshBindingMaskOnly();
      new import_obsidian.Notice("\u64CD\u4F5C\u5DF2\u5B8C\u6210");
    } else {
      this.bindingError = "\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5";
    }
    this.renderBindingPanel();
  }
  renderDeviceList() {
    const wrap = this.deviceListEl;
    if (!wrap) return;
    wrap.empty();
    if (!this.plugin.deviceId) {
      wrap.createEl("div", {
        cls: "setting-item-description",
        text: "\u6682\u65E0\u5176\u4ED6\u8BBE\u5907\u8FDE\u63A5"
      });
      return;
    }
    if (this.devicesLoading) {
      wrap.createEl("div", { cls: "setting-item-description", text: "\u52A0\u8F7D\u4E2D\u2026" });
      return;
    }
    if (this.devicesError) {
      wrap.createEl("div", {
        cls: "setting-item-description vault-sync-binding-error",
        text: this.devicesError
      });
      return;
    }
    if (this.devices.length === 0) {
      wrap.createEl("div", { cls: "setting-item-description", text: "\u6682\u65E0\u5176\u4ED6\u8BBE\u5907\u8FDE\u63A5" });
      return;
    }
    const table = wrap.createEl("table", { cls: "vault-sync-device-table" });
    const thead = table.createEl("thead");
    const hr = thead.createEl("tr");
    hr.createEl("th", { text: "\u8BBE\u5907\u540D" });
    hr.createEl("th", { text: "\u7C7B\u578B" });
    hr.createEl("th", { text: "\u6700\u8FD1\u6D3B\u8DC3" });
    hr.createEl("th", { text: "\u64CD\u4F5C" });
    const tbody = table.createEl("tbody");
    const sorted = [...this.devices].sort((a, b) => {
      const cur = this.plugin.deviceId;
      if (a.device_id === cur) return -1;
      if (b.device_id === cur) return 1;
      return 0;
    });
    for (const d of sorted) {
      const isCurrent = d.device_id === this.plugin.deviceId;
      const tr = tbody.createEl("tr", {
        cls: isCurrent ? "vault-sync-device-row-current" : void 0
      });
      const nameCell = tr.createEl("td");
      nameCell.appendText(d.device_name || "\u672A\u547D\u540D\u8BBE\u5907");
      if (isCurrent) {
        nameCell.appendText(" ");
        nameCell.createSpan({ cls: "vault-sync-badge-current", text: "\u5F53\u524D\u8BBE\u5907" });
      }
      tr.createEl("td", { text: formatDeviceTypeForUi(d.device_type) });
      const last = d.last_active_at != null && Number.isFinite(d.last_active_at) ? formatDeviceLastActive(d.last_active_at) : "\u6682\u65E0\u8BB0\u5F55";
      tr.createEl("td", { text: last });
      const tdOp = tr.createEl("td");
      if (!isCurrent) {
        const btn = tdOp.createEl("button", { cls: "vault-sync-binding-copy-btn", text: "\u5220\u9664" });
        btn.type = "button";
        btn.addEventListener("click", () => {
          if (window.confirm(
            `\u79FB\u9664\u540E\uFF0C\u8BE5\u8BBE\u5907\u5C06\u65E0\u6CD5\u7EE7\u7EED\u540C\u6B65\uFF0C\u9700\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u624D\u80FD\u8FDE\u63A5\u3002

\u786E\u5B9A\u79FB\u9664\u300C${d.device_name || "\u8BE5\u8BBE\u5907"}\u300D\u5417\uFF1F`
          )) {
            void this.plugin.deleteDeviceOnServer(d.device_id).then((ok) => {
              if (ok) void this.reloadDevices();
            });
          }
        });
      } else {
        tdOp.createSpan({ cls: "setting-item-description", text: "\u4E0D\u53EF\u79FB\u9664" });
      }
    }
    if (sorted.length === 1) {
      wrap.createEl("div", {
        cls: "setting-item-description",
        text: "\u5F53\u524D\u4EC5\u6B64\u8BBE\u5907"
      });
    }
  }
  async reloadDevices() {
    if (!this.plugin.deviceId) {
      this.devices = [];
      this.renderDeviceList();
      this.refreshSyncStatusPanel();
      return;
    }
    this.devicesLoading = true;
    this.devicesError = null;
    this.renderDeviceList();
    const res = await this.plugin.fetchDevicesList();
    this.devicesLoading = false;
    if (res.ok) {
      this.devices = res.devices;
    } else {
      this.devicesError = res.message;
    }
    this.renderDeviceList();
    this.refreshSyncStatusPanel();
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    this.clearBindingTimers();
    this.clearSyncStatusTicker();
    this.bindingPanelEl = null;
    this.deviceListEl = null;
    this.bindingCopyFeedback = null;
    this.revealedFullCode = null;
    this.revealExpireAt = null;
    this.bindingError = null;
    this.devicesError = null;
    this.revealHint = null;
    this.syncStatusContainerEl = null;
    this.debugIdentityEl = null;
    const titleRow = containerEl.createDiv({ cls: "hailysync-settings-title" });
    titleRow.createEl("h2", { text: "\u6D77\u72F8\u540C\u6B65" });
    titleRow.createEl("div", { cls: "hailysync-settings-brand-en", text: "HailySync" });
    const syncWrap = containerEl.createDiv({ cls: "vault-sync-section vault-sync-sync-status-section" });
    syncWrap.createEl("div", { cls: "vault-sync-section-label", text: "\u540C\u6B65\u72B6\u6001" });
    this.syncStatusContainerEl = syncWrap.createDiv({ cls: "vault-sync-sync-status" });
    this.fillSyncStatusSection(this.syncStatusContainerEl);
    this.syncStatusTicker = window.setInterval(() => {
      this.refreshSyncStatusPanel();
    }, 1e3);
    const bindingBlock = containerEl.createDiv({ cls: "vault-sync-binding-card" });
    new import_obsidian.Setting(bindingBlock).setName("\u8BBE\u5907\u7ED1\u5B9A\u7801").setDesc("\u7528\u4E8E\u8FDE\u63A5\u65B0\u8BBE\u5907\uFF0C\u8BF7\u59A5\u5584\u4FDD\u5B58\uFF0C\u907F\u514D\u6CC4\u9732").addButton(
      (btn) => btn.setButtonText("\u663E\u793A").onClick(() => {
        void this.onShowReveal();
      })
    ).addButton(
      (btn) => btn.setButtonText("\u590D\u5236").onClick(() => {
        void this.copyFullBindingCode();
      })
    ).addButton(
      (btn) => btn.setButtonText("\u91CD\u7F6E").setWarning().onClick(() => {
        void this.onResetBinding();
      })
    );
    this.bindingPanelEl = bindingBlock.createDiv({ cls: "vault-sync-binding-panel" });
    this.renderBindingPanel();
    let bindingInput = null;
    const bindNewBlock = containerEl.createDiv({ cls: "vault-sync-section" });
    new import_obsidian.Setting(bindNewBlock).setName("\u7ED1\u5B9A\u65B0\u8BBE\u5907").setDesc("\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u5373\u53EF\u8FDE\u63A5").addText((text) => {
      bindingInput = text.inputEl;
      text.setPlaceholder("\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801");
    }).addButton((btn) => {
      btn.setButtonText("\u8FDE\u63A5\u8BBE\u5907");
      const syncConnectButtonState = () => {
        const has = !!bindingInput?.value?.trim();
        if (btn.buttonEl.textContent === "\u8FDE\u63A5\u4E2D\u2026") return;
        btn.setDisabled(!has);
      };
      bindingInput?.addEventListener("input", syncConnectButtonState);
      syncConnectButtonState();
      btn.onClick(() => {
        const code = bindingInput?.value?.trim() ?? "";
        if (!code) return;
        void (async () => {
          let reopened = false;
          btn.setButtonText("\u8FDE\u63A5\u4E2D\u2026");
          btn.setDisabled(true);
          try {
            const ok = await this.plugin.bindWithCode(code);
            if (ok) {
              reopened = true;
              this.display();
            }
          } finally {
            if (!reopened) {
              btn.setButtonText("\u8FDE\u63A5\u8BBE\u5907");
              syncConnectButtonState();
            }
          }
        })();
      });
    });
    const devBlock = containerEl.createDiv({ cls: "vault-sync-devices-block" });
    new import_obsidian.Setting(devBlock).setName("\u5DF2\u7ED1\u5B9A\u8BBE\u5907").setDesc("\u5F53\u524D\u8BBE\u5907\u4E0D\u53EF\u79FB\u9664").addButton((btn) => {
      btn.buttonEl.classList.add("mod-muted");
      btn.setButtonText("\u5237\u65B0\u5217\u8868").onClick(() => {
        void this.reloadDevices();
      });
    });
    this.deviceListEl = devBlock.createDiv({ cls: "vault-sync-device-list" });
    this.renderDeviceList();
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u540C\u6B65").setDesc("\u5F00\u542F\u540E\u5C06\u81EA\u52A8\u5B9A\u671F\u540C\u6B65\uFF08\u63A8\u8350\u5F00\u542F\uFF09").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableSync).onChange(async (value) => {
        this.plugin.settings.enableSync = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u624B\u52A8\u540C\u6B65").setDesc("\u7ACB\u5373\u6267\u884C\u4E00\u6B21\u540C\u6B65").addButton((btn) => {
      btn.setButtonText("\u7ACB\u5373\u540C\u6B65");
      btn.onClick(() => {
        void (async () => {
          if (this.plugin.isSyncing) {
            new import_obsidian.Notice("\u8BF7\u7A0D\u5019\uFF0C\u4E0A\u4E00\u540C\u6B65\u5C1A\u672A\u7ED3\u675F");
            return;
          }
          const idleLabel = "\u7ACB\u5373\u540C\u6B65";
          btn.setButtonText("\u6B63\u5728\u540C\u6B65\u2026");
          btn.setDisabled(true);
          try {
            await this.plugin.syncNow();
          } finally {
            btn.setDisabled(false);
            if (this.plugin.lastSyncError) {
              btn.setButtonText(idleLabel);
            } else {
              btn.setButtonText("\u540C\u6B65\u5B8C\u6210");
              window.setTimeout(() => {
                btn.setButtonText(idleLabel);
              }, 1e3);
            }
          }
        })();
      });
    });
    const advanced = containerEl.createEl("details", { cls: "vault-sync-advanced" });
    advanced.createEl("summary", { text: "\u9AD8\u7EA7\u8BBE\u7F6E" });
    advanced.createEl("div", {
      cls: "setting-item-description vault-sync-advanced-hint",
      text: "\u4EC5\u5728\u9700\u8981\u65F6\u4FEE\u6539"
    });
    const advBody = advanced.createDiv({ cls: "vault-sync-advanced-body" });
    new import_obsidian.Setting(advBody).setName("\u670D\u52A1\u5668\u5730\u5740").setDesc("\u7559\u7A7A\u5C06\u4F7F\u7528\u9ED8\u8BA4\u670D\u52A1\u5668").addText(
      (text) => text.setPlaceholder(BUILTIN_DEFAULT_SERVER_URL).setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
        this.plugin.settings.serverUrl = value.trim() || BUILTIN_DEFAULT_SERVER_URL;
        await this.plugin.saveSettings();
      })
    );
    const debugDetails = advBody.createEl("details", { cls: "vault-sync-debug-details" });
    debugDetails.createEl("summary", { text: "\u8C03\u8BD5\u4FE1\u606F\uFF08\u5C55\u5F00\uFF09" });
    this.debugIdentityEl = debugDetails.createDiv({ cls: "vault-sync-debug-identity" });
    debugDetails.addEventListener("toggle", () => {
      if (debugDetails.open) {
        this.fillDebugIdentity();
      }
    });
    void this.plugin.ensureDeviceIdentity().then(async () => {
      this.refreshSyncStatusPanel();
      if (this.plugin.connectionState === "connected" && this.plugin.deviceId) {
        await this.refreshBindingMaskOnly();
        this.renderBindingPanel();
        void this.reloadDevices();
      }
    });
  }
};
var SYNC_STATUS_RESULT_MS = 3500;
var SYNC_COOLDOWN_MS = 2e3;
var AUTO_SYNC_INTERVAL_MS = 6e4;
var AUTO_SYNC_START_MIN_MS = 2e3;
var AUTO_SYNC_START_MAX_MS = 5e3;
var ObsidianSyncPlugin = class extends import_obsidian.Plugin {
  settings = DEFAULT_SETTINGS;
  /** 由 `.sync_config.json` 与服务端同步 */
  userId = "";
  deviceId = "";
  connectionState = "initializing";
  /** 是否因 DEVICE_REVOKED 进入待绑定（与 .sync_config.json 的 was_revoked 一致） */
  wasRevoked = false;
  /** 内存中的 vault 密钥（32B），来自 .sync_crypto.json 或绑定解密 */
  vaultKey = null;
  vaultKeyVersion = 1;
  /** 最近一次成功完成同步的时间（用于设置页展示） */
  lastSyncAt = null;
  /** 最近一次同步失败原因（成功同步后清空） */
  lastSyncError = null;
  syncRunning = false;
  /** 自动同步与手动同步紧挨着结束时，短暂冷却避免并发重叠 */
  syncCooldownUntil = 0;
  get isSyncing() {
    return this.syncRunning;
  }
  statusBarItem = null;
  statusResultTimer = null;
  autoSyncStartupTimerId = null;
  async onload() {
    try {
      await this.loadSettings();
      await this.ensureDeviceIdentity();
    } catch (e) {
      console.error("[HailySync] onload init failed", e);
      try {
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
      } catch {
      }
      this.connectionState = "awaiting_bind";
      this.userId = "";
      this.deviceId = "";
    }
    try {
      this.initSyncStatusBar();
    } catch (e) {
      console.error("[HailySync] status bar init failed", e);
    }
    try {
      this.addSettingTab(new HailySyncSettingTab(this.app, this));
    } catch (e) {
      console.error("[HailySync] addSettingTab failed", e);
    }
    try {
      this.addCommand({
        id: "hailysync-sync-now",
        name: "\u7ACB\u5373\u540C\u6B65",
        callback: () => {
          void this.syncNow();
        }
      });
    } catch (e) {
      console.error("[HailySync] addCommand failed", e);
    }
    const startupDelay = AUTO_SYNC_START_MIN_MS + Math.floor(Math.random() * (AUTO_SYNC_START_MAX_MS - AUTO_SYNC_START_MIN_MS + 1));
    this.autoSyncStartupTimerId = window.setTimeout(() => {
      this.autoSyncStartupTimerId = null;
      if (this.settings.enableSync && this.connectionState === "connected" && this.deviceId) {
        void this.syncNow({ auto: true });
      }
    }, startupDelay);
    this.register(() => {
      if (this.autoSyncStartupTimerId != null) {
        window.clearTimeout(this.autoSyncStartupTimerId);
        this.autoSyncStartupTimerId = null;
      }
    });
    const intervalId = window.setInterval(() => {
      if (!this.settings.enableSync) return;
      if (this.connectionState !== "connected" || !this.deviceId) return;
      void this.syncNow({ auto: true });
    }, AUTO_SYNC_INTERVAL_MS);
    this.registerInterval(intervalId);
  }
  onunload() {
    this.clearStatusResultTimer();
  }
  initSyncStatusBar() {
    this.statusBarItem = this.addStatusBarItem();
    this.setSyncStatusIdle();
  }
  clearStatusResultTimer() {
    if (this.statusResultTimer != null) {
      window.clearTimeout(this.statusResultTimer);
      this.statusResultTimer = null;
    }
  }
  setSyncStatusText(text) {
    if (this.statusBarItem) {
      this.statusBarItem.textContent = text;
    }
  }
  setSyncStatusIdle() {
    this.clearStatusResultTimer();
    this.setSyncStatusText("\u540C\u6B65\u8FD0\u884C\u6B63\u5E38");
  }
  setSyncStatusSyncing() {
    this.clearStatusResultTimer();
    this.setSyncStatusText("\u6B63\u5728\u540C\u6B65\u2026");
  }
  setSyncStatusSuccess() {
    this.clearStatusResultTimer();
    this.setSyncStatusText("\u540C\u6B65\u5B8C\u6210");
    this.statusResultTimer = window.setTimeout(() => {
      this.statusResultTimer = null;
      this.setSyncStatusIdle();
    }, SYNC_STATUS_RESULT_MS);
  }
  setSyncStatusFailed() {
    this.clearStatusResultTimer();
    this.setSyncStatusText("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5");
    this.statusResultTimer = window.setTimeout(() => {
      this.statusResultTimer = null;
      this.setSyncStatusIdle();
    }, SYNC_STATUS_RESULT_MS);
  }
  async loadSettings() {
    let loaded = {};
    try {
      loaded = await this.loadData();
    } catch (e) {
      console.error("[HailySync] loadData failed", e);
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    if (typeof this.settings.enableSync !== "boolean") {
      this.settings.enableSync = DEFAULT_SETTINGS.enableSync;
    }
    if (typeof this.settings.serverUrl !== "string" || !this.settings.serverUrl.trim()) {
      this.settings.serverUrl = BUILTIN_DEFAULT_SERVER_URL;
    } else {
      this.settings.serverUrl = this.settings.serverUrl.trim().replace(/\/+$/, "");
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  get baseUrl() {
    const raw = this.settings?.serverUrl;
    const s = typeof raw === "string" ? raw.trim() : "";
    const u = s || BUILTIN_DEFAULT_SERVER_URL;
    return u.replace(/\/+$/, "");
  }
  /** 除 POST /api/init、POST /api/bind 外所有 sync API 使用 */
  syncApiHeaders() {
    const id = typeof this.deviceId === "string" ? this.deviceId.trim() : "";
    if (!id) return {};
    return {
      "X-Device-Id": id,
      "X-HailySync-Protocol": "1"
    };
  }
  async persistVaultKeyLocal(vaultKey, vaultKeyVersion) {
    if (vaultKey.length !== 32) throw new Error("E2EE_VAULT_KEY_LEN");
    this.vaultKey = vaultKey;
    this.vaultKeyVersion = vaultKeyVersion;
    await this.app.vault.adapter.write(
      SYNC_CRYPTO_FILENAME,
      JSON.stringify(
        {
          vault_key_b64u: bytesToBase64url(vaultKey),
          vault_key_version: vaultKeyVersion
        },
        null,
        2
      )
    );
  }
  async wipeVaultKeyLocal() {
    this.vaultKey = null;
    this.vaultKeyVersion = 1;
    try {
      const exists = this.app.vault.getAbstractFileByPath(SYNC_CRYPTO_FILENAME);
      if (exists instanceof import_obsidian.TFile) await this.app.vault.delete(exists);
    } catch {
    }
  }
  assertBindEnvelopeMatchesRoot(data) {
    assertEnvelopeShape(data.envelope);
    if (data.envelope.kek_salt !== data.kek_salt) throw new Error("E2EE_BIND_KEK_SALT_MISMATCH");
    if (data.envelope.kek_derivation_version !== data.kek_derivation_version) {
      throw new Error("E2EE_BIND_KEK_DERIVATION_MISMATCH");
    }
    if (data.envelope.vault_key_version !== data.vault_key_version) {
      throw new Error("E2EE_BIND_VAULT_KEY_VERSION_MISMATCH");
    }
    if (data.envelope.envelope_version !== 1) throw new Error("E2EE_BIND_ENVELOPE_VERSION");
    if (data.envelope.algorithm !== "AES-256-GCM") throw new Error("E2EE_BIND_ENVELOPE_ALGORITHM");
  }
  /** 首设备：用 init 返回的 binding_code 派生 KEK、PUT envelope、落盘 vault_key */
  async bootstrapVaultFromInit(bindingCodeRaw) {
    if (typeof bindingCodeRaw !== "string" || !bindingCodeRaw.trim()) {
      throw new Error("E2EE_INIT_MISSING_BINDING_CODE");
    }
    const normalized = normalizeBindingCode(bindingCodeRaw);
    const salt = randomBytes(16);
    const kekDerivationVersion = 1;
    const vaultKeyVersion = 1;
    const vaultKey = randomBytes(32);
    const kek = await deriveKek(normalized, salt, kekDerivationVersion);
    const envelope = await wrapVaultKeyToEnvelope(
      vaultKey,
      kek,
      kekDerivationVersion,
      salt,
      vaultKeyVersion
    );
    await axios_default.put(`${this.baseUrl}/api/vault/envelope`, envelope, {
      headers: this.syncApiHeaders(),
      ...AXIOS_LARGE_FILE_DEFAULTS
    });
    await this.persistVaultKeyLocal(vaultKey, vaultKeyVersion);
  }
  async unlockVaultFromBindingCode(bindingCodeRaw, envelope) {
    const vaultKey = await unwrapVaultKeyFromEnvelope(
      envelope,
      normalizeBindingCode(bindingCodeRaw)
    );
    await this.persistVaultKeyLocal(vaultKey, envelope.vault_key_version);
  }
  /** GET /api/vault/envelope（与冻结协议字段一致） */
  async fetchVaultEnvelope() {
    const res = await axios_default.get(`${this.baseUrl}/api/vault/envelope`, {
      headers: this.syncApiHeaders(),
      ...AXIOS_TIMEOUT_DEFAULTS
    });
    if (!isPlainObjectRecord(res.data)) {
      throw new Error("GET /api/vault/envelope \u54CD\u5E94\u975E\u6CD5");
    }
    assertEnvelopeShape(res.data);
    return res.data;
  }
  /** 404 → null；其余错误原样抛出（含 DEVICE_REVOKED） */
  async fetchVaultEnvelopeOrNotFound() {
    try {
      return await this.fetchVaultEnvelope();
    } catch (e) {
      if (isDeviceRevokedError(e)) throw e;
      if (isAxiosError2(e) && e.response?.status === 404) return null;
      throw e;
    }
  }
  async readBindingCodeFromConfigFile() {
    try {
      const raw = await this.app.vault.adapter.read(SYNC_CONFIG_FILENAME);
      const p = JSON.parse(raw || "{}");
      if (!isPlainObjectRecord(p)) return null;
      const c = p.binding_code;
      if (typeof c === "string" && c.trim()) return c.trim();
    } catch {
    }
    return null;
  }
  /** 同步/上传/下载前：内存或 .sync_crypto → 必要时 GET envelope + 绑定码恢复，或 404 时用绑定码首包 PUT */
  async ensureVaultCryptoForSync() {
    if (this.vaultKey != null && this.vaultKey.length === 32) return;
    let raw;
    try {
      raw = await this.app.vault.adapter.read(SYNC_CRYPTO_FILENAME);
      let p;
      try {
        p = JSON.parse(raw || "{}");
      } catch {
        throw new Error("E2EE_CRYPTO_FILE_CORRUPT");
      }
      if (!isPlainObjectRecord(p)) throw new Error("E2EE_CRYPTO_FILE_CORRUPT");
      const kb = p.vault_key_b64u;
      const vv = p.vault_key_version;
      if (typeof kb !== "string" || typeof vv !== "number" || !Number.isFinite(vv)) {
        throw new Error("E2EE_CRYPTO_FILE_CORRUPT");
      }
      this.vaultKey = base64urlToBytes(kb);
      this.vaultKeyVersion = vv;
      if (this.vaultKey.length !== 32) throw new Error("E2EE_CRYPTO_FILE_CORRUPT");
      return;
    } catch (e) {
      if (e instanceof Error && e.message === "E2EE_CRYPTO_FILE_CORRUPT") throw e;
    }
    if (!this.deviceId) {
      throw new Error("E2EE_NEED_DEVICE");
    }
    const bindingFromDisk = await this.readBindingCodeFromConfigFile();
    let envelope;
    try {
      envelope = await this.fetchVaultEnvelopeOrNotFound();
    } catch (e) {
      if (isDeviceRevokedError(e)) await this.handleDeviceRevoked();
      throw e;
    }
    if (envelope !== null) {
      if (!bindingFromDisk) {
        throw new Error("E2EE_NEED_BINDING_CODE");
      }
      await this.unlockVaultFromBindingCode(bindingFromDisk, envelope);
      return;
    }
    if (bindingFromDisk) {
      await this.bootstrapVaultFromInit(bindingFromDisk);
      return;
    }
    throw new Error("E2EE_NEED_FIRST_SETUP");
  }
  async ensureVaultKeyLoaded() {
    await this.ensureVaultCryptoForSync();
  }
  /** pending_bind 时仅待绑定；否则读盘或 POST /api/init */
  async ensureDeviceIdentity() {
    if (this.userId && this.deviceId && this.connectionState === "connected") return;
    try {
      const raw = await this.app.vault.adapter.read(SYNC_CONFIG_FILENAME);
      const parsed = JSON.parse(raw || "{}");
      if (isPlainObjectRecord(parsed) && parsed.pending_bind === true) {
        this.userId = "";
        this.deviceId = "";
        this.wasRevoked = parsed.was_revoked === true;
        this.connectionState = "awaiting_bind";
        return;
      }
      if (isPlainObjectRecord(parsed) && typeof parsed.user_id === "string" && parsed.user_id.trim() !== "" && typeof parsed.device_id === "string" && parsed.device_id.trim() !== "") {
        this.userId = parsed.user_id.trim();
        this.deviceId = parsed.device_id.trim();
        this.wasRevoked = false;
        this.connectionState = "connected";
        return;
      }
      if (isPlainObjectRecord(parsed) && typeof parsed.user_id === "string" && parsed.user_id.trim() !== "" && !parsed.device_id) {
        this.userId = "";
        this.deviceId = "";
        this.wasRevoked = false;
        this.connectionState = "awaiting_bind";
        await this.app.vault.adapter.write(
          SYNC_CONFIG_FILENAME,
          JSON.stringify({ pending_bind: true }, null, 2)
        );
        new import_obsidian.Notice("\u8BF7\u5148\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801", 12e3);
        return;
      }
    } catch {
    }
    this.connectionState = "initializing";
    await this.callApiInit();
  }
  async callApiInit() {
    const server = this.baseUrl;
    if (!server) {
      this.connectionState = "awaiting_bind";
      new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
      return;
    }
    try {
      const res = await axios_default.post(
        `${server}/api/init`,
        {
          device_name: getDeviceDisplayName(),
          device_type: getDeviceTypeLabel()
        },
        { ...AXIOS_TIMEOUT_DEFAULTS }
      );
      const uid = res.data?.user_id;
      const did = res.data?.device_id;
      const bindingCode = res.data?.binding_code;
      if (typeof uid !== "string" || !uid.trim() || typeof did !== "string" || !did.trim()) {
        this.connectionState = "awaiting_bind";
        new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5");
        return;
      }
      if (typeof bindingCode !== "string" || !bindingCode.trim()) {
        this.connectionState = "awaiting_bind";
        new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5");
        return;
      }
      try {
        await this.persistFullIdentity(uid.trim(), did.trim(), bindingCode.trim());
        await this.bootstrapVaultFromInit(bindingCode);
      } catch (e) {
        await this.wipeVaultKeyLocal();
        this.userId = "";
        this.deviceId = "";
        this.connectionState = "awaiting_bind";
        await this.app.vault.adapter.write(
          SYNC_CONFIG_FILENAME,
          JSON.stringify({ pending_bind: true }, null, 2)
        );
        new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5", 12e3);
        return;
      }
    } catch (e) {
      this.connectionState = "awaiting_bind";
      if (isNetworkError(e)) {
        new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
      } else {
        new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5");
      }
    }
  }
  /**
   * @param bindingCodeToStore 非空则写入/覆盖 config 内 binding_code；省略则保留盘中已有 binding_code
   */
  async persistFullIdentity(userId, deviceId, bindingCodeToStore) {
    let existingBinding;
    try {
      const raw = await this.app.vault.adapter.read(SYNC_CONFIG_FILENAME);
      const p = JSON.parse(raw || "{}");
      if (isPlainObjectRecord(p) && typeof p.binding_code === "string" && p.binding_code.trim()) {
        existingBinding = p.binding_code.trim();
      }
    } catch {
    }
    const storeBinding = bindingCodeToStore !== void 0 && bindingCodeToStore.trim() !== "" ? bindingCodeToStore.trim() : existingBinding;
    this.userId = userId.trim();
    this.deviceId = deviceId.trim();
    this.connectionState = "connected";
    this.wasRevoked = false;
    const out = {
      user_id: this.userId,
      device_id: this.deviceId
    };
    if (storeBinding) out.binding_code = storeBinding;
    await this.app.vault.adapter.write(SYNC_CONFIG_FILENAME, JSON.stringify(out, null, 2));
  }
  async handleDeviceRevoked() {
    await this.wipeVaultKeyLocal();
    this.connectionState = "awaiting_bind";
    this.wasRevoked = true;
    this.userId = "";
    this.deviceId = "";
    await this.app.vault.adapter.write(
      SYNC_CONFIG_FILENAME,
      JSON.stringify(
        { pending_bind: true, was_revoked: true },
        null,
        2
      )
    );
  }
  async fetchBindingCodeRaw() {
    await this.ensureDeviceIdentity();
    if (!this.deviceId) return null;
    const server = this.baseUrl;
    if (!server) return null;
    try {
      const res = await axios_default.get(`${server}/api/binding-code`, {
        headers: this.syncApiHeaders(),
        ...AXIOS_TIMEOUT_DEFAULTS
      });
      return extractBindingCodeFromJson(res.data);
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new import_obsidian.Notice("\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5", 12e3);
        return null;
      }
      if (isNetworkError(e)) {
        new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
        return null;
      }
      return null;
    }
  }
  async resetBindingCodeOnServer() {
    if (!this.deviceId) return false;
    const server = this.baseUrl;
    if (!server) return false;
    try {
      await axios_default.post(
        `${server}/api/binding-code/reset`,
        {},
        { headers: this.syncApiHeaders(), ...AXIOS_TIMEOUT_DEFAULTS }
      );
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new import_obsidian.Notice("\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5", 12e3);
        return false;
      }
      if (isNetworkError(e)) {
        new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
        return false;
      }
      return false;
    }
  }
  async fetchDevicesList() {
    if (!this.deviceId) return { ok: true, devices: [] };
    try {
      const res = await axios_default.get(`${this.baseUrl}/api/devices`, {
        headers: this.syncApiHeaders(),
        ...AXIOS_TIMEOUT_DEFAULTS
      });
      const devices = parseDevicesListPayload(res.data);
      return { ok: true, devices };
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        return { ok: false, message: "\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5" };
      }
      console.error("[HailySync] fetchDevicesList failed", e);
      return { ok: true, devices: [] };
    }
  }
  async deleteDeviceOnServer(targetId) {
    if (!this.deviceId) return false;
    const server = this.baseUrl;
    if (!server) return false;
    try {
      await axios_default.post(
        `${server}/api/device/delete`,
        { device_id: targetId },
        { headers: this.syncApiHeaders(), ...AXIOS_TIMEOUT_DEFAULTS }
      );
      new import_obsidian.Notice("\u64CD\u4F5C\u5DF2\u5B8C\u6210");
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new import_obsidian.Notice("\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5", 12e3);
        return false;
      }
      if (isNetworkError(e)) {
        new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
        return false;
      }
      new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5");
      return false;
    }
  }
  async bindWithCode(raw) {
    const code = raw.trim();
    if (!code) {
      new import_obsidian.Notice("\u8BF7\u5148\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801");
      return false;
    }
    const server = this.baseUrl;
    if (!server) {
      new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC", 6e3);
      return false;
    }
    try {
      const res = await axios_default.post(
        `${server}/api/bind`,
        {
          binding_code: code,
          device_name: getDeviceDisplayName(),
          device_type: getDeviceTypeLabel()
        },
        { ...AXIOS_TIMEOUT_DEFAULTS }
      );
      const uid = res.data?.user_id;
      const did = res.data?.device_id;
      const kekSalt = res.data?.kek_salt;
      const kekDv = res.data?.kek_derivation_version;
      const vkv = res.data?.vault_key_version;
      const envelope = res.data?.envelope;
      if (typeof uid !== "string" || !uid.trim() || typeof did !== "string" || !did.trim()) {
        new import_obsidian.Notice("\u8BBE\u5907\u7ED1\u5B9A\u5931\u8D25\uFF0C\u8BF7\u786E\u8BA4\u7ED1\u5B9A\u7801\u6B63\u786E", 6e3);
        return false;
      }
      if (typeof kekSalt !== "string" || typeof kekDv !== "number" || typeof vkv !== "number" || envelope == null || typeof envelope !== "object") {
        new import_obsidian.Notice("\u8BBE\u5907\u7ED1\u5B9A\u5931\u8D25\uFF0C\u8BF7\u786E\u8BA4\u7ED1\u5B9A\u7801\u6B63\u786E", 8e3);
        return false;
      }
      try {
        this.assertBindEnvelopeMatchesRoot({
          kek_salt: kekSalt,
          kek_derivation_version: kekDv,
          vault_key_version: vkv,
          envelope
        });
        await this.unlockVaultFromBindingCode(code, envelope);
      } catch (e) {
        console.error("[HailySync] bind unlock failed", e);
        new import_obsidian.Notice("\u8BBE\u5907\u7ED1\u5B9A\u5931\u8D25\uFF0C\u8BF7\u786E\u8BA4\u7ED1\u5B9A\u7801\u6B63\u786E", 12e3);
        await this.wipeVaultKeyLocal();
        return false;
      }
      await this.persistFullIdentity(uid.trim(), did.trim(), code.trim());
      new import_obsidian.Notice("\u8BBE\u5907\u8FDE\u63A5\u6210\u529F\uFF0C\u5F00\u59CB\u540C\u6B65");
      void this.syncNow();
      return true;
    } catch (e) {
      if (isDeviceRevokedError(e)) {
        await this.handleDeviceRevoked();
        new import_obsidian.Notice("\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5", 12e3);
        return false;
      }
      if (isNetworkError(e)) {
        new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
        return false;
      }
      new import_obsidian.Notice("\u8BBE\u5907\u7ED1\u5B9A\u5931\u8D25\uFF0C\u8BF7\u786E\u8BA4\u7ED1\u5B9A\u7801\u6B63\u786E");
      return false;
    }
  }
  async loadMeta() {
    try {
      const content = await this.app.vault.adapter.read(SYNC_META_FILENAME);
      const parsed = JSON.parse(content || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const raw = parsed;
        const out = {};
        for (const [k, v] of Object.entries(raw)) {
          const path = normalizeVaultPath(k);
          if (!isPlainObjectRecord(v)) continue;
          const rec = v;
          const ch = rec.cipher_hash;
          const cs = rec.cipher_size;
          out[path] = {
            cipher_hash: typeof ch === "string" ? ch.toLowerCase() : null,
            cipher_size: typeof cs === "number" ? cs : null,
            updated_at: typeof rec.updated_at === "number" && Number.isFinite(rec.updated_at) ? rec.updated_at : Date.now(),
            deleted: rec.deleted === true,
            encryption_version: typeof rec.encryption_version === "number" ? rec.encryption_version : ENCRYPTION_VERSION_WIRE,
            vault_key_version: typeof rec.vault_key_version === "number" ? rec.vault_key_version : 1,
            plain_fingerprint: typeof rec.plain_fingerprint === "string" ? rec.plain_fingerprint : ""
          };
        }
        return out;
      }
    } catch {
    }
    return {};
  }
  async saveMeta(meta) {
    await this.app.vault.adapter.write(SYNC_META_FILENAME, JSON.stringify(meta, null, 2));
  }
  /** 本地待同步路径（已 shouldSync 过滤） */
  listLocalFiles() {
    return this.app.vault.getMarkdownFiles().map((f) => normalizeVaultPath(f.path)).filter(shouldSync);
  }
  /** GET /files → { items } → path→meta */
  async fetchRemoteFiles() {
    const res = await axios_default.get(this.baseUrl + "/files", {
      headers: this.syncApiHeaders(),
      responseType: "text",
      ...AXIOS_TIMEOUT_DEFAULTS
    });
    const raw = res.data;
    if (typeof raw !== "string") {
      throw new Error("/files \u54CD\u5E94\u7C7B\u578B\u5F02\u5E38");
    }
    const s = raw.trim();
    if (s === "") {
      throw new Error("/files \u7A7A\u54CD\u5E94");
    }
    let data;
    try {
      data = JSON.parse(s);
    } catch (e) {
      console.error("JSON parse failed", e);
      throw new Error("/files \u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON");
    }
    const remoteFiles = parseRemoteFilesItems(data);
    console.log("/files items \u2192 paths:", Object.keys(remoteFiles).length);
    return remoteFiles;
  }
  async uploadFile(filePath, meta) {
    const normalized = normalizeVaultPath(filePath);
    try {
      if (!this.deviceId) {
        throw new Error("\u7F3A\u5C11\u8BBE\u5907 ID\uFF08\u9700\u8981 X-Device-Id\uFF09");
      }
      await this.ensureVaultKeyLoaded();
      const content = await this.app.vault.adapter.read(normalized);
      const plain = new TextEncoder().encode(content ?? "");
      const plainFp = (0, import_blueimp_md5.default)(content || "");
      const wire = await encryptPlainToWire(
        plain,
        normalized,
        this.vaultKey,
        this.vaultKeyVersion
      );
      const cipher_hash = await sha256HexOfBytes(wire);
      const cipher_size = wire.length;
      console.log("upload e2ee:", normalized, plain.length, cipher_hash);
      const updated_at = Date.now();
      const form = new FormData();
      const basename = normalized.includes("/") ? normalized.slice(normalized.lastIndexOf("/") + 1) : normalized;
      form.append(
        "file",
        new Blob([wire], { type: "application/octet-stream" }),
        basename || "file"
      );
      form.append("relative_path", normalized);
      form.append("updated_at", String(updated_at));
      form.append("cipher_hash", cipher_hash);
      form.append("cipher_size", String(cipher_size));
      form.append("encryption_version", String(ENCRYPTION_VERSION_WIRE));
      form.append("vault_key_version", String(this.vaultKeyVersion));
      const uploadRes = await axios_default.post(this.baseUrl + "/upload", form, {
        headers: this.syncApiHeaders(),
        ...AXIOS_LARGE_FILE_DEFAULTS
      });
      const d = uploadRes.data;
      if (d.success !== true || typeof d.cipher_hash !== "string" || typeof d.cipher_size !== "number" || typeof d.updated_at !== "number" || typeof d.encryption_version !== "number" || typeof d.vault_key_version !== "number") {
        throw new Error("\u4E0A\u4F20\u54CD\u5E94\u5B57\u6BB5\u4E0D\u5B8C\u6574\u6216 success \u975E true");
      }
      meta[normalized] = {
        cipher_hash: d.cipher_hash.toLowerCase(),
        cipher_size: d.cipher_size,
        updated_at: d.updated_at,
        deleted: false,
        encryption_version: d.encryption_version,
        vault_key_version: d.vault_key_version,
        plain_fingerprint: plainFp
      };
    } catch (err) {
      console.error("upload failed:", normalized, err);
      throw err;
    }
  }
  async downloadFile(filePath, meta, remote) {
    const normalized = normalizeVaultPath(filePath);
    try {
      if (!this.deviceId) {
        throw new Error("\u7F3A\u5C11\u8BBE\u5907 ID\uFF08\u9700\u8981 X-Device-Id\uFF09");
      }
      await this.ensureVaultKeyLoaded();
      if (remote.encryption_version !== ENCRYPTION_VERSION_WIRE) {
        throw new Error(`\u4E0D\u652F\u6301\u7684 encryption_version:${remote.encryption_version}`);
      }
      const res = await axios_default.get(this.baseUrl + "/download", {
        params: { relative_path: normalized },
        headers: this.syncApiHeaders(),
        responseType: "arraybuffer",
        ...AXIOS_LARGE_FILE_DEFAULTS
      });
      const buf = httpResponseBodyToArrayBuffer(res.data);
      assertDownloadWireResponse(buf, res.headers["content-type"]);
      const plainBuf = await decryptWireToPlain(
        new Uint8Array(buf),
        normalized,
        this.vaultKey
      );
      const content = new TextDecoder("utf-8", { fatal: false }).decode(plainBuf);
      const plainFp = (0, import_blueimp_md5.default)(content);
      const exists = this.app.vault.getAbstractFileByPath(normalized);
      if (exists) {
        await this.app.vault.adapter.write(normalized, content);
      } else {
        await ensureVaultFoldersForPath(this.app.vault, normalized);
        await this.app.vault.create(normalized, content);
      }
      meta[normalized] = {
        cipher_hash: typeof remote.cipher_hash === "string" ? remote.cipher_hash.toLowerCase() : null,
        cipher_size: remote.cipher_size,
        updated_at: remote.updated_at,
        deleted: false,
        encryption_version: remote.encryption_version,
        vault_key_version: remote.vault_key_version,
        plain_fingerprint: plainFp
      };
      console.log("download e2ee:", normalized, content.length, plainFp);
    } catch (err) {
      if (isAxiosError2(err) && err.response?.status === 404) {
        throw new Error(`\u4E0B\u8F7D\u5931\u8D25\uFF1A\u8FDC\u7AEF\u65E0\u6B64\u6587\u4EF6 (HTTP 404) \xB7 ${normalized}`);
      }
      console.error("download failed:", normalized, err);
      throw err;
    }
  }
  /** 将远端密文解密后写入 `原名.conflict.md` */
  async writeConflictFromRemote(filePath, remote) {
    const normalized = normalizeVaultPath(filePath);
    await this.ensureVaultKeyLoaded();
    if (remote.encryption_version !== ENCRYPTION_VERSION_WIRE) {
      throw new Error(`\u4E0D\u652F\u6301\u7684 encryption_version:${remote.encryption_version}`);
    }
    try {
      const res = await axios_default.get(this.baseUrl + "/download", {
        params: { relative_path: normalized },
        headers: this.syncApiHeaders(),
        responseType: "arraybuffer",
        ...AXIOS_LARGE_FILE_DEFAULTS
      });
      const buf = httpResponseBodyToArrayBuffer(res.data);
      assertDownloadWireResponse(buf, res.headers["content-type"]);
      const plainBuf = await decryptWireToPlain(
        new Uint8Array(buf),
        normalized,
        this.vaultKey
      );
      const content = new TextDecoder("utf-8", { fatal: false }).decode(plainBuf);
      const withoutMd = normalized.replace(/\.md$/i, "");
      const conflictPath = `${withoutMd}.conflict.md`;
      await ensureVaultFoldersForPath(this.app.vault, conflictPath);
      const exists = this.app.vault.getAbstractFileByPath(conflictPath);
      if (exists) {
        await this.app.vault.adapter.write(conflictPath, content);
      } else {
        await this.app.vault.create(conflictPath, content);
      }
      console.log("sync decision:", normalized, "conflict", "WROTE_CONFLICT_COPY", conflictPath);
    } catch (err) {
      if (isAxiosError2(err) && err.response?.status === 404) {
        throw new Error(`\u51B2\u7A81\u526F\u672C\u4E0B\u8F7D\u5931\u8D25\uFF1A\u8FDC\u7AEF\u65E0\u6B64\u6587\u4EF6 (HTTP 404) \xB7 ${normalized}`);
      }
      throw err;
    }
  }
  async postDeleteRemote(filePath) {
    const normalized = normalizeVaultPath(filePath);
    const updated_at = Date.now();
    const res = await axios_default.post(
      this.baseUrl + "/delete",
      {
        relative_path: normalized,
        updated_at
      },
      { headers: this.syncApiHeaders(), ...AXIOS_TIMEOUT_DEFAULTS }
    );
    const d = res.data;
    if (d.success !== true || d.relative_path !== normalized || typeof d.updated_at !== "number") {
      throw new Error("\u5220\u9664\u54CD\u5E94\u4E0D\u7B26\u5408\u51BB\u7ED3\u534F\u8BAE\uFF08success / relative_path / updated_at\uFF09");
    }
  }
  async deleteLocalFile(path) {
    const normalized = normalizeVaultPath(path);
    const f = this.app.vault.getAbstractFileByPath(normalized);
    if (f instanceof import_obsidian.TFile) {
      await this.app.vault.delete(f);
    }
  }
  async syncNow(options) {
    const isAuto = options?.auto === true;
    if (isAuto && Date.now() < this.syncCooldownUntil) {
      return;
    }
    try {
      await this.ensureDeviceIdentity();
    } catch (e) {
      console.error("[HailySync] ensureDeviceIdentity in syncNow", e);
      return;
    }
    if (this.syncRunning) {
      new import_obsidian.Notice("\u8BF7\u7A0D\u5019\uFF0C\u4E0A\u4E00\u540C\u6B65\u5C1A\u672A\u7ED3\u675F");
      return;
    }
    this.syncRunning = true;
    try {
      if (!this.settings.enableSync) {
        this.lastSyncError = "\u540C\u6B65\u5DF2\u5173\u95ED\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u5F00\u542F\u81EA\u52A8\u540C\u6B65";
        this.setSyncStatusFailed();
        new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5");
        if (isAuto) console.log("[auto-sync] failed");
        return;
      }
      const server = this.baseUrl;
      if (!server) {
        this.lastSyncError = "\u65E0\u6548\u7684\u670D\u52A1\u5668\u5730\u5740";
        this.setSyncStatusFailed();
        new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC");
        if (isAuto) console.log("[auto-sync] failed");
        return;
      }
      if (!this.deviceId || this.connectionState !== "connected") {
        this.lastSyncError = this.wasRevoked ? "\u5F53\u524D\u8BBE\u5907\u5DF2\u88AB\u79FB\u9664\uFF0C\u65E0\u6CD5\u7EE7\u7EED\u540C\u6B65" : "\u8BF7\u5148\u5B8C\u6210\u8BBE\u5907\u7ED1\u5B9A\u540E\u518D\u540C\u6B65";
        this.setSyncStatusFailed();
        if (this.wasRevoked) {
          new import_obsidian.Notice("\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5", 12e3);
        } else {
          new import_obsidian.Notice("\u8BBE\u5907\u7ED1\u5B9A\u5931\u8D25\uFF0C\u8BF7\u786E\u8BA4\u7ED1\u5B9A\u7801\u6B63\u786E", 8e3);
        }
        if (isAuto) console.log("[auto-sync] failed");
        return;
      }
      try {
        await this.ensureVaultCryptoForSync();
      } catch (e) {
        if (isDeviceRevokedError(e)) {
          await this.handleDeviceRevoked();
          this.lastSyncError = "\u5F53\u524D\u8BBE\u5907\u5DF2\u88AB\u79FB\u9664\uFF0C\u65E0\u6CD5\u7EE7\u7EED\u540C\u6B65";
          this.setSyncStatusFailed();
          new import_obsidian.Notice("\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5", 12e3);
          if (isAuto) console.log("[auto-sync] failed");
          return;
        }
        this.lastSyncError = formatSyncError(e);
        this.setSyncStatusFailed();
        if (e instanceof Error && e.message === "E2EE_NEED_BINDING_CODE") {
          new import_obsidian.Notice("\u8BBE\u5907\u7ED1\u5B9A\u5931\u8D25\uFF0C\u8BF7\u786E\u8BA4\u7ED1\u5B9A\u7801\u6B63\u786E", 15e3);
        } else if (e instanceof Error && e.message === "E2EE_NEED_FIRST_SETUP") {
          new import_obsidian.Notice("\u8BBE\u5907\u7ED1\u5B9A\u5931\u8D25\uFF0C\u8BF7\u786E\u8BA4\u7ED1\u5B9A\u7801\u6B63\u786E", 15e3);
        } else {
          new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5", 12e3);
        }
        if (isAuto) console.log("[auto-sync] failed");
        return;
      }
      if (isAuto) console.log("[auto-sync] start");
      this.setSyncStatusSyncing();
      new import_obsidian.Notice("\u6B63\u5728\u540C\u6B65\u2026");
      const meta = await this.loadMeta();
      for (const k of Object.keys(meta)) {
        if (!shouldSync(k)) delete meta[k];
      }
      let remote;
      try {
        remote = await this.fetchRemoteFiles();
      } catch (err) {
        if (isDeviceRevokedError(err)) {
          await this.handleDeviceRevoked();
          this.lastSyncError = "\u5F53\u524D\u8BBE\u5907\u5DF2\u88AB\u79FB\u9664\uFF0C\u65E0\u6CD5\u7EE7\u7EED\u540C\u6B65";
          this.setSyncStatusFailed();
          new import_obsidian.Notice("\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5", 12e3);
          if (isAuto) console.log("[auto-sync] failed");
          return;
        }
        this.setSyncStatusFailed();
        if (isNetworkError(err)) {
          this.lastSyncError = "\u7F51\u7EDC\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
          new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC", 8e3);
        } else {
          const detail = formatSyncError(err);
          this.lastSyncError = `\u65E0\u6CD5\u83B7\u53D6\u7B14\u8BB0\u5217\u8868\uFF1A${detail}`;
          new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5", 8e3);
        }
        if (isAuto) console.log("[auto-sync] failed");
        return;
      }
      const localPaths = this.listLocalFiles();
      const pathSet = /* @__PURE__ */ new Set();
      for (const p of localPaths) {
        if (shouldSync(p)) pathSet.add(normalizeVaultPath(p));
      }
      for (const k of Object.keys(meta)) {
        if (shouldSync(k)) pathSet.add(normalizeVaultPath(k));
      }
      for (const k of Object.keys(remote)) {
        if (shouldSync(k)) pathSet.add(normalizeVaultPath(k));
      }
      const sortedPaths = [...pathSet].sort();
      const stepErrors = [];
      for (const path of sortedPaths) {
        const abstract = this.app.vault.getAbstractFileByPath(path);
        const localExists = abstract instanceof import_obsidian.TFile;
        let localPlainFp = null;
        if (localExists) {
          try {
            const content = await this.app.vault.adapter.read(path);
            localPlainFp = (0, import_blueimp_md5.default)(content || "");
          } catch {
            localPlainFp = null;
          }
        }
        const r = remote[path];
        const remoteDeleted = r?.deleted === true;
        try {
          if (remoteDeleted) {
            if (localExists) {
              if (!meta[path]) {
                console.log("sync decision:", path, "upload", "LOCAL_NEW_REMOTE_TOMBSTONE");
                await this.uploadFile(path, meta);
                continue;
              }
              console.log("sync decision:", path, "delete_local", "REMOTE_DELETED");
              await this.deleteLocalFile(path);
            }
            delete meta[path];
            continue;
          }
          if (!localExists && meta[path]) {
            if (meta[path].deleted) {
              delete meta[path];
              continue;
            }
            console.log("sync decision:", path, "post_delete_remote", "LOCAL_DELETED");
            await this.postDeleteRemote(path);
            delete meta[path];
            continue;
          }
          if (localExists) {
            if (localPlainFp === null) {
              console.log("sync decision:", path, "noop", "read_failed");
              continue;
            }
            console.log("compare:", {
              filePath: path,
              localPlainFp,
              remoteCipher: r?.cipher_hash
            });
            if (!r) {
              console.log("sync decision:", path, "upload", "LOCAL_NEW");
              await this.uploadFile(path, meta);
              continue;
            }
            const remoteCipherStr = typeof r.cipher_hash === "string" ? r.cipher_hash.toLowerCase() : "";
            if (remoteCipherStr === "" || r.encryption_version !== ENCRYPTION_VERSION_WIRE) {
              console.log("sync decision:", path, "noop", "remote_cipher_or_enc_invalid");
              continue;
            }
            const baseCipherRaw = meta[path]?.cipher_hash;
            const baseCipherStr = typeof baseCipherRaw === "string" ? baseCipherRaw.toLowerCase() : "";
            const basePlain = meta[path]?.plain_fingerprint ?? "";
            const hasBase = baseCipherStr.length > 0;
            if (hasBase && baseCipherStr === remoteCipherStr && basePlain === localPlainFp) {
              console.log("sync decision:", path, "noop", "SYNCED");
              meta[path] = {
                cipher_hash: remoteCipherStr,
                cipher_size: r.cipher_size,
                updated_at: r.updated_at,
                deleted: false,
                encryption_version: r.encryption_version,
                vault_key_version: r.vault_key_version,
                plain_fingerprint: localPlainFp
              };
              continue;
            }
            if (hasBase && basePlain !== localPlainFp && baseCipherStr !== remoteCipherStr) {
              console.log("sync decision:", path, "conflict", "BOTH_MODIFIED");
              await this.writeConflictFromRemote(path, r);
              continue;
            }
            if (hasBase && basePlain === localPlainFp && baseCipherStr !== remoteCipherStr) {
              console.log("sync decision:", path, "download", "REMOTE_MODIFIED");
              await this.downloadFile(path, meta, r);
              continue;
            }
            if (hasBase && baseCipherStr === remoteCipherStr && basePlain !== localPlainFp) {
              console.log("sync decision:", path, "upload", "LOCAL_MODIFIED");
              await this.uploadFile(path, meta);
              continue;
            }
            console.log("sync decision:", path, "upload", "LOCAL_MODIFIED_OR_NO_BASE");
            await this.uploadFile(path, meta);
            continue;
          }
          if (r) {
            console.log("sync decision:", path, "download", "REMOTE_NEW");
            await this.downloadFile(path, meta, r);
            continue;
          }
        } catch (e) {
          if (isDeviceRevokedError(e)) {
            await this.handleDeviceRevoked();
            this.lastSyncError = "\u5F53\u524D\u8BBE\u5907\u5DF2\u88AB\u79FB\u9664\uFF0C\u65E0\u6CD5\u7EE7\u7EED\u540C\u6B65";
            this.setSyncStatusFailed();
            new import_obsidian.Notice("\u8BF7\u91CD\u65B0\u8F93\u5165\u8BBE\u5907\u7ED1\u5B9A\u7801\u4EE5\u6062\u590D\u8FDE\u63A5", 12e3);
            if (isAuto) console.log("[auto-sync] failed");
            return;
          }
          console.error("sync step failed:", path, e);
          stepErrors.push(`${path}: ${formatSyncError(e)}`);
        }
      }
      await this.saveMeta(meta);
      if (stepErrors.length > 0) {
        const preview = stepErrors.length <= 2 ? stepErrors.join("\uFF1B") : `${stepErrors.slice(0, 2).join("\uFF1B")} \u7B49\u5171 ${stepErrors.length} \u5904`;
        this.lastSyncError = preview.length > 500 ? `${preview.slice(0, 500)}\u2026` : preview;
        this.setSyncStatusFailed();
        new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5", 1e4);
        if (isAuto) console.log("[auto-sync] failed");
        return;
      }
      this.lastSyncAt = Date.now();
      this.lastSyncError = null;
      this.setSyncStatusSuccess();
      new import_obsidian.Notice("\u540C\u6B65\u5B8C\u6210");
      if (isAuto) console.log("[auto-sync] success");
    } catch (e) {
      this.setSyncStatusFailed();
      if (isNetworkError(e)) {
        this.lastSyncError = "\u7F51\u7EDC\u5F02\u5E38\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
        new import_obsidian.Notice("\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC", 8e3);
      } else {
        const msg = formatSyncError(e);
        this.lastSyncError = msg;
        new import_obsidian.Notice("\u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5", 8e3);
      }
      if (isAuto) console.log("[auto-sync] failed");
    } finally {
      this.syncRunning = false;
      this.syncCooldownUntil = Date.now() + SYNC_COOLDOWN_MS;
    }
  }
};
/*! Bundled license information:

mime-db/index.js:
  (*!
   * mime-db
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015-2022 Douglas Christopher Wilson
   * MIT Licensed
   *)

mime-types/index.js:
  (*!
   * mime-types
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

hash-wasm/dist/index.umd.js:
  (*!
   * hash-wasm (https://www.npmjs.com/package/hash-wasm)
   * (c) Dani Biro
   * @license MIT
   *)
*/
