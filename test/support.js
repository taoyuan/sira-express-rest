"use strict";

var t = exports.t = require('chai').assert;

var extend = require('util')._extend;

exports.createSharedClass =  function createSharedClass(config) {
    // create a class that can be remoted
    var SharedClass = function(id) {
        this.id = id;
    };
    extend(SharedClass, config);

    SharedClass.shared = true;

    SharedClass.sharedCtor = function(id, cb) {
        cb(null, new SharedClass(id));
    };

    extend(SharedClass.sharedCtor, {
        shared: true,
        accepts: [ { arg: 'id', type: 'any', http: { source: 'path' }}],
        http: { path: '/:id' },
        returns: { root: true }
    });

    return SharedClass;
};

