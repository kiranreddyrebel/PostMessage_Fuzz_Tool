// ==UserScript==
// @name         postmessagehook
// @namespace    http://tampermonkey.net/
// @version      1.0
// @run-at       document-start
// @description  PostMessage logger for security testing
// @author       Gary O'Leary-Steele
// @match        http*://*/*
// @grant        none
// ==/UserScript==

(function() {

var url = "chrome-extension://mjohdillgacmiggnljlgkhmmnmbpchfp/logger.html";

var id = "appcheck_postmessage_logging_frame";
var do_not_hook = "chrome-extension://mjohdillgacmiggnljlgkhmmnmbpchfp/";

(function(funcName, baseObj) {
    funcName = funcName || "docReady";
    baseObj = baseObj || window;
    var readyList = [];
    var readyFired = false;
    var readyEventHandlersInstalled = false;

    function ready() {
        if (!readyFired) {
            readyFired = true;
            for (var i = 0; i < readyList.length; i++) {
                readyList[i].fn.call(window, readyList[i].ctx);
            }
            readyList = [];
        }
    }

    function readyStateChange() {
        if ( document.readyState === "complete" ) {
            ready();
        }
    }

    baseObj[funcName] = function(callback, context) {
        if (readyFired) {
            setTimeout(function() {callback(context);}, 1);
            return;
        } else {
            readyList.push({fn: callback, ctx: context});
        }
        if (document.readyState === "complete") {
            setTimeout(ready, 1);
        } else if (!readyEventHandlersInstalled) {
            if (document.addEventListener) {
                document.addEventListener("DOMContentLoaded", ready, false);
                window.addEventListener("load", ready, false);
            } else {
                document.attachEvent("onreadystatechange", readyStateChange);
                window.attachEvent("onload", ready);
            }
            readyEventHandlersInstalled = true;
        }
    };
})("docReady", window);

// http://blakeembrey.com/articles/2014/01/wrapping-javascript-functions/
var before = function (before, fn) {
  return function () {
    try{
        before.apply(this, arguments);
    }catch(e){
        console.error(e);
    }
    return fn.apply(this, arguments);
  };
};

// message listener to determine when the logger frame is ready
var logger_iframe_ready = false;
function iframe_is_ready(event){

    try{
        if (event.data == "logger_iframe_ready"){
            console.log("logger iframe ready");
            logger_iframe_ready = true;

            // if we have any in the queue then send the messages.
            if(logger_queue.length > 0) {
                    for(var i=0,l=logger_queue.length; i<l; i++) {
                        var entry = logger_queue[i];
                        postLogMessage(entry);
                    }
            }


        // Only works on chrome.
        //getEventListenersChrome()
        }

    }catch(e){}
}
window.addEventListener("message", iframe_is_ready);

//Used to temp store events while iframe isn't ready
var logger_queue = [];


function create_logging_iframe() {
    var f = window.document.getElementById(id);
    if (!f){
        var iframe = document.createElement("iframe");
        iframe.src = url;
        iframe.id = id;
        iframe.style = "display:block; visibility:hidden";
        try {
            console.log('document should be ready attaching iframe');
            // This error is caught
            window.document.body.appendChild(iframe);
            console.log('iframe attached...');

        } catch(e) {
            console.log("document.body not ready yet");
            return false;
        }
        return iframe;
    } else {
        return f;
    }
}


function postLogMessage(entry) {
    // Grab the iframe
    var logging_frame;
    try{
        logging_frame = create_logging_iframe();
    }catch(e){
        console.warn("Error Creating IFrame");
        console.error(e);
    }

    //If we have it send a message
    if (logging_frame && logger_iframe_ready){
        try{
            logging_frame.contentWindow.postMessage(entry, "*");
        }catch(e){
            console.warn("Error occured posting message to external frame");
            console.log(logging_frame);
            logger_queue.push(entry);
        }
        console.log('Sending Message');
    } else {
        //If not queue the message...
        logger_queue.push(entry);
        console.log('Saving Message');
        //The below could go in as a part backup if none of the ready events fire...???
        //create_logging_iframe();
    }
}

function logmsg(evt){
    /*
    Log messages sent to message handlers
    */

    //console.warn(evt);
    //console.warn(evt.origin)
    var origin = evt.origin;
    var source = evt.source;
    var target = evt.target;
    var data = evt.data;
    if (source.location){
        try{
            source = source.location.href;
        }catch(e){
            //source = JSON.stringify(origin);
            source = origin;
            //console.warn(source);
        }
    }
    if (target.location){
        try{
            target = target.location.href;
        }catch(e){
            target = location.href;
        }
    }

    if(source.indexOf(do_not_hook) == -1) {
        var m = {"post_message_hook":true,"from":source,"to":target, "origin":origin,"data":data};
        postLogMessage(m);
    }
}

/* / this only works in the console??
function getEventListenersChrome(){
    try{
            if(getEventListeners) {
                var m = getEventListeners(window);
                if(m['message']) {
                    for(var i=0,l=m['message'].length; i<l; i++) {
                        var evt = m['message'][i];
                        var entry = {"event": 'message', "handler": evt.listener.toString(),"href":window.location.href};
                        postLogMessage(entry);
                    }
                }
            }

    }catch(e){}
}
getEventListenersChrome();
*/

function hookevents(target_obj){

    if (!target_obj.prototype.realAddEventListener){

        var dont_log = ['DOMContentLoaded', 'load'];

        var wrapper = function() {
            // If its a message handler we wrap the handler to record messages
            if (arguments[0] == "message"){
                // record the unwrapped handler so we log the correct code.
                var real_handler = arguments[1];
                arguments[1] = before(logmsg, arguments[1]);
            }
            try{
                this.realAddEventListener.apply(this, arguments);
            }catch(e){
                // for some reason we failed to find our hook
                console.error(e);
                console.log(arguments);
                console.log(this);
            }
            // Only log message handlers
            if(arguments[0] != 'message') {
                return;
            }
            for(var i=0,l=dont_log.length; i<l; i++) {
                if(dont_log[i] == arguments[0]) {
                    return;
                }
            }

            var entry = {};

            try {
                entry = {"post_message_hook":true, "event": arguments[0], "handler": real_handler.toString(),"href":window.location.href};
            } catch(e) {
                entry = {"post_message_hook":true, "event": arguments[0], "handler": "native","href":window.location.href};
            }

            postLogMessage(entry);
        };

        if(target_obj.prototype.addEventListener) {
            target_obj.prototype.realAddEventListener = target_obj.prototype.addEventListener;
            target_obj.prototype.addEventListener = wrapper;
        } else if(target_obj.attachEvent) {
            //Prob never used but doesn't hurt
            target_obj.prototype.realAddEventListener = target_obj.prototype.attachEvent;
            target_obj.prototype.attachEvent = wrapper;
        }

        if(target_obj instanceof Window) {
            target_obj.prototype.onmessage = function() {
                this.realAddEventListener.apply(this, arguments);
            };
        }

        console.log("Added event listener hook to: "  + window.location.href);
    }
}

// So we dont hook the logger frame
if (window.location.href.indexOf(do_not_hook) == -1) {
    hookevents(EventTarget);
    console.log("hooked!!!");
    //hookevents(Window);
    //hookevents(Document);
    var iframeLoop = function() {
        var logging_frame = create_logging_iframe();
        if(!logging_frame) {
            setTimeout(function(){
                iframeLoop();
            }, 1000);
        }
    };
    iframeLoop();
    } else {
    console.log("Not hooking logger");
}

})();
