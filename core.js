(function(window) {
  var document = window.document;

  function now() {
    return Date.now()/1000;
  }

  function newTracker(keyword, options) {
    var tracker = {};

    if (options === undefined) {
      options = {};
    }

    options.timeout = options.timeout ? options.timeout : 30;

    tracker.created = now();
    tracker.updated = now();
    tracker.keyword = keyword;
    tracker.state = "processing";

    tracker.done = function() {
      tracker.updated = now();
      tracker.state = "done";
    };

    tracker.error = function() {
      tracker.updated = now();
      tracker.state = "error";
    };

    tracker.timeout = function() {
      tracker.updated = now();
      tracker.state = "timeout";
    };

    tracker.isTimeout = function() {
      if ((now()-tracker.created)>options.timeout) {
        tracker.timeout();
        tracker.report();
        return true;
      }
      return false;
    };

    tracker.report = function() {
      var s = "";
      s += "&keyword=" + tracker.keyword;
      s += "&state=" + tracker.state;
      s += "&created=" + tracker.created;
      s += "&updated=" + tracker.updated;
      fetch("/log.api?event=tracker_report"+s);
    };

    return tracker;
  }

  function newTrackCenter(options) {
    var center = {};

    if (options === undefined) {
      options = {};
    }

    options.timeout = options.timeout ? options.timeout : 30;

    center._trackers = {};

    center.getKeywords = function() {
      return Object.keys(center._trackers);
    };

    center.getTrackerByKeyword = function(keyword) {
      return center._trackers[keyword];
    };

    center.newTracker = function(keyword) {
      if (keyword in center._trackers) {
        let tracker = center._trackers[keyword];
        if (!tracker.isTimeout()) {
          return null;
        }
        delete(center._trackers[keyword]);
      }

      let tracker = newTracker(keyword, {timeout: options.timeout});
      center._trackers[keyword] = tracker;

      setTimeout((tracker)=>{
        if (!(tracker.keyword in center._trackers)) {
          return;
        }
        tracker.timeout();
        tracker.report();
        delete(center._trackers[tracker.keyword]);
        if (options.timeoutCallback) {
          options.timeoutCallback(tracker);
        }
      }, options.timeout*1000, tracker);

      return tracker;
    };

    center.closeTracker = function(keyword) {
      if (!(keyword in center._trackers)) {
        return;
      }
      delete(center._trackers[keyword]);
    };

    return center;
  }

  function newConverterDashboard(converter, options) {
    var dashboard = {};
    dashboard.converter = converter;
    dashboard.state = "stop";

    if (options === undefined) {
      options = {};
    }

    options.fps = options.fps ? options.fps : 1;

    let rootBoard = document.querySelector(options.board ? options.board : "#dashboard");

    let queuedKeywordSizeBoard = document.querySelector(".dashboard.queuedkeywordsize");
    if (queuedKeywordSizeBoard === null) {
      let span = document.createElement("span");
      span.className = "dashboard queuedkeysize";
      let div = document.createElement("div");
      div.appendChild(span);
      rootBoard.appendChild(div);
      queuedKeywordSizeBoard = span;
    }

    let queuedKeywordsBoard = document.querySelector(".dashboard.queuedkeywords");
    if (queuedKeywordsBoard === null) {
      let textarea = document.createElement("textarea");
      textarea.className = "dashboard queuedkeywords";
      textarea.cols = 80;
      textarea.rows = 10;
      let div = document.createElement("div");
      div.appendChild(textarea);
      rootBoard.appendChild(div);
      queuedKeywordsBoard = textarea;
    }

    let currentKeywordsBoard = document.querySelector(".dashboard.currentkeywords");
    if (currentKeywordsBoard === null) {
      let textarea = document.createElement("textarea");
      textarea.className = "dashboard currentkeywords";
      textarea.cols = 80;
      textarea.rows = 10;
      let div = document.createElement("div");
      div.appendChild(textarea);
      rootBoard.appendChild(div);
      currentKeywordsBoard = textarea;
    }

    dashboard.render =function() {
      let quedSize = dashboard.converter.queuedKeywordSize();
      let curr = dashboard.converter.currentKeywords();
      let qued = dashboard.converter.queuedKeywords();

      queuedKeywordSizeBoard.innerHTML = quedSize;
      queuedKeywordsBoard.value = qued.join("\n");
      currentKeywordsBoard.value = curr.join("\n");

    };

    dashboard.start = function() {
      if (dashboard.state === "running") {
        return;
      }

      dashboard.state = "running";
      dashboard._renderfd = setInterval(()=>{ dashboard.render(); }, 1000/options.fps);
    };

    dashboard.stop = function() {
      clearInterval(dashboard._renderfd);
      dashboard.state = "stop";
    };

    return dashboard;
  }

  function newConverter(options) {
    if (options === undefined) {
      options = {};
    }

    var conv = {};
    conv._trackCenter = newTrackCenter();
    conv._keywords = [];
    conv.state = "stop";
    conv.dashboard = newConverterDashboard(conv);

    conv.currentKeywords = function() {
      return conv._trackCenter.getKeywords();
    };

    conv.queuedKeywords = function(topn) {
      if (topn  === undefined) {
        topn = 10;
      }

      return conv._keywords.slice(conv._keywords.length-topn, conv._keywords);
    };

    conv.queuedKeywordSize = function() {
      return conv._keywords.length;
    };

    var searchCity = options.city ? options.city : "北京市";
    conv._searchEngine = new BMap.LocalSearch(searchCity);
    conv._searchEngine.setSearchCompleteCallback(function(result) {
      let s = "";
      s += "&timestamp=" + now();
      s += "&keyword=" + result.keyword;
      s += "&city=" + result.city;
      s += "&province=" + result.province;
      s += "&more_results_url=" + btoa(result.moreResultsUrl);
      s += "&num_pois=" + result.getNumPois();

      var poi = result.getPoi(0);
      for (let i=1; poi != undefined; i++) {
        let prefix = "&poi." + i + ".";

        s += prefix + "title=" + poi.title;
        s += prefix + "city=" + poi.city;
        s += prefix + "province=" + poi.province;
        s += prefix + "address=" + poi.address;
        s += prefix + "point.latitude=" + poi.point.lat;
        s += prefix + "point.longitude=" + poi.point.lng;
        s += prefix + "is_accurate=" + poi.isAccurate ? 1 : 0;
        s += prefix + "tags=" + (poi.tags ? poi.tags.join(";") : "");
        s += prefix + "url=" + btoa(poi.url);

        poi = result.getPoi(i);
      }

      let tracker = conv._trackCenter.getTrackerByKeyword(result.keyword);
      if (tracker) {
        fetch("/log.api?event=convert"+s);
        tracker.done();
        tracker.report();
        conv._trackCenter.closeTracker(result.keyword);
      }
    });

    conv.convert = function(keywords) {
      if (typeof(keywords) === "string") {
        keywords = [keywords];
      }

      conv._keywords.push.apply(conv._keywords, keywords);
    };

    conv.start = function() {
      if (conv.state === "running") {
        return;
      }

      conv.state = "running";
      conv._fd = setInterval(function() {
        let keyword = conv._keywords.pop();
        if (keyword === undefined) {
          return;
        }

        conv._searchEngine.search(keyword);
        conv._trackCenter.newTracker(keyword, {
          timeoutCallback: function(tracker) {
            conv.convert(tracker.keyword);
          }});
      }, 250);
      conv.dashboard.start();
    };

    conv.stop = function() {
      conv.dashboard.stop();
      clearInterval(conv._fd);
      conv.state = "stop";
    };

    return conv;
  }
  window.newConverter = newConverter;
})(window);
