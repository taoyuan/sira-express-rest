"use strict";

var express = require('express');
var request = require('supertest');
var sira = require('sira');

var rest = require('../lib/rest');

var s = require('./support');
var t = s.t;

describe.only('integration', function () {

    var app, server, sapp, handler;

    before(function(done) {
        app = express();
        app.disable('x-powered-by');
        app.use(function () {
            handler.apply(undefined, arguments);
        });
        server = app.listen(done);
    });

    describe('remoting options', function(){
        it('should reject json payload larger than 1kb', function(done) {
            var method = setupAndGivenSharedStaticMethod(
                function greet(msg, cb) {
                    cb(null, msg);
                },
                {
                    accepts: { arg: 'person', type: 'string', source: 'payload'},
                    returns: { arg: 'msg', type: 'string' }
                }
            );

            // Build an object that is larger than 1kb
            var name = "";
            for (var i = 0; i < 2048; i++) {
                name += "11111111111";
            }

            request(app)['post'](method.url)
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .send(name)
                .expect(413, done);
        });
    });

    describe('call of constructor method', function() {
        it('should work', function (done) {
            var method = setupAndGivenSharedStaticMethod(
                function greet(msg, cb) {
                    cb(null, msg);
                },
                {
                    accepts: { arg: 'person', type: 'string' },
                    returns: { arg: 'msg', type: 'string' }
                }
            );

            json(method.url + '?person=hello')
                .expect(200, { msg: 'hello' }, done);
        });

        it('should allow arguments in the path', function(done) {
            var method = setupAndGivenSharedStaticMethod(
                function bar(a, b, cb) {
                    cb(null, a + b);
                },
                {
                    accepts: [
                        { arg: 'b', type: 'number' },
                        { arg: 'a', type: 'number', source: 'path' }
                    ],
                    returns: { arg: 'n', type: 'number' },
                    http: { path: '/:a' }
                }
            );

            json(method.classUrl +'/1?b=2')
                .expect({ n: 3 }, done);
        });


        it('should allow arguments in the query', function(done) {
            var method = setupAndGivenSharedStaticMethod(
                function bar(a, b, cb) {
                    cb(null, a + b);
                },
                {
                    accepts: [
                        { arg: 'b', type: 'number' },
                        { arg: 'a', type: 'number', source: 'query' }
                    ],
                    returns: { arg: 'n', type: 'number' },
                    http: { path: '/' }
                }
            );

            json(method.classUrl +'/?a=1&b=2')
                .expect({ n: 3 }, done);
        });

        it('should allow custom argument functions', function(done) {
            var method = setupAndGivenSharedStaticMethod(
                function bar(a, b, cb) {
                    cb(null, a + b);
                },
                {
                    accepts: [
                        { arg: 'b', type: 'number' },
                        { arg: 'a', type: 'number', source: function(ctx) {
                            return ctx.request.query.a;
                        } }
                    ],
                    returns: { arg: 'n', type: 'number' },
                    http: { path: '/' }
                }
            );

            json(method.classUrl +'/?a=1&b=2')
                .expect({ n: 3 }, done);
        });


        it('should pass undefined if the argument is not supplied', function (done) {
            var called = false;
            var method = setupAndGivenSharedStaticMethod(
                function bar(a, cb) {
                    called = true;
                    assert(a === undefined, 'a should be undefined');
                    cb();
                },
                {
                    accepts: [
                        { arg: 'b', type: 'number' }
                    ]
                }
            );

            json(method.url).end(function() {
                t(called);
                done();
            });
        });

        it('should allow arguments in the body', function(done) {
            var method = setupAndGivenSharedStaticMethod(
                function bar(a, cb) {
                    cb(null, a);
                },
                {
                    accepts: [
                        { arg: 'a', type: 'object', source: 'payload' }
                    ],
                    returns: { arg: 'data', type: 'object', root: true },
                    http: { path: '/' }
                }
            );

            request(app)['post'](method.classUrl)
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .send('{"x": 1, "y": "Y"}')
                .expect('Content-Type', /json/)
                .expect(200, function(err, res){
                    t.deepEqual(res.body, {"x": 1, "y": "Y"});
                    done(err, res);
                });
        });


    });


    function json(method, url) {
        if (url === undefined) {
            url = method;
            method = 'get';
        }

        return request(app)[method](url)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json')
            .expect('Content-Type', /json/);
    }

    function setup(fns) {
        return createSapp(fns, function (err, _sapp) {
            if (err) throw err;
            sapp = _sapp;
            handler = rest(_sapp.remotes, _sapp);
        });
    }

    function setupAndGivenSharedStaticMethod(fn, config) {
        var result = null;
        setup(function (sapp) {
            result = givenSharedStaticMethod(sapp, fn, config);
        });
        return result;
    }

});

function createSapp(fns, cb) {
    var sapp = sira();
    if (fns) {
        fns = Array.isArray(fns) ? fns : [fns];
        fns.forEach(function (fn) {
            fn(sapp);
        })
    }

    sapp.phase(sira.boot.database());
    sapp.phase(function () {
        sapp.use(sapp.dispatcher);
    });
    sapp.boot({
        remoting: {json: {limit: '1kb'}}
    }, function (err) {
        cb(err, sapp);
    });
    return sapp;
}

function givenSharedStaticMethod(sapp, fn, config) {
    if (typeof fn === 'object' && config === undefined) {
        config = fn;
        fn = null;
    }
    fn = fn || function(cb) { cb(); };

    sapp.registry.define('testClass', {}, function (testClass) {
        testClass.testMethod = fn;
        testClass.expose('testMethod', config);
    });

    return {
        name: 'testClass.testMethod',
        url: '/testClass/testMethod',
        classUrl: '/testClass'
    };
}