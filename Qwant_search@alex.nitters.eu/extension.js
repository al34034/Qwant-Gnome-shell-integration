//   This library is free software; you can redistribute it and/or
//   modify it under the terms of the GNU Library General Public
//   License as published by the Free Software Foundation; either
//   version 3 of the License, or (at your option) any later version.
//
//   This library is distributed in the hope that it will be useful,
//   but WITHOUT ANY WARRANTY; without even the implied warranty of
//   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
//   Library General Public License for more details.
//
//   You should have received a copy of the GNU Library General Public
//   License along with this library; if not, write to the Free Software
//   Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA

// view log: journalctl /usr/bin/gnome-session -f -o cat

const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;
const Tweener = imports.ui.tweener;
const Params = imports.misc.params;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Soup = imports.gi.Soup;
const Convenience = Me.imports.convenience;

const Gettext = imports.gettext;

Gettext.textdomain("Qwant_search@alex.nitters.eu");
Gettext.bindtextdomain("Qwant_search@alex.nitters.eu", Me.path + "/locale");

const _ = Gettext.gettext;

const preferences = Convenience.getSettings();

let qwantSearchProvider = null;

let searchUrlMap = {
  "qwant": 'https://www.qwant.com/?t={category}&q=',
  "junior": 'https://www.qwantjunior.com/?t={category}&q=',
  "edu": 'https://www.edu.qwantjunior.com/?t={category}&q=',
  "lite": 'https://www.lite.qwant.com/?t={category}&q='
};
let suggestionsUrlMap = {
  "qwant": 'https://api.qwant.com/api/suggest',
  "junior": 'https://api.qwant.com/api/suggest',
  "edu": 'https://api.qwant.com/api/suggest',
  "lite": 'https://api.qwant.com/api/suggest'
};
let requestUrlMap = {
  "qwant": 'https://api.qwant.com/api/search/{category}',
  "junior": 'https://api.qwant.com/api/search/{category}',
  "edu": 'https://api.qwant.com/api/search/{category}',
  "lite": 'https://api.qwant.com/api/search/{category}'
};

let searchUrl = searchUrlMap[preferences.get_string("search-engine")];
let suggestionsUrl = suggestionsUrlMap[preferences.get_string("search-engine")];
let requestUrl = requestUrlMap[preferences.get_string("search-engine")];
let qwantLocale = _("fr");
let _httpSession = new Soup.Session();

let button;
let baseGIcon;
let hoverGIcon;
let buttonIcon;

let currentRequest = null;

let debug = true;

function logDebug() {
  if (debug) {
    log.apply(
      this,
      Array.from(arguments)
    )
  }
}

function makeResult(name, description, icon, id) {
  return {
    'id': id,
    'name': name,
    'description': description,
    'icon': icon
  }
}

function makeLaunchContext(params) {
  params = Params.parse(params, {
    workspace: -1,
    timestamp: global.display.get_current_time_roundtrip()
  });

  const launchContext = global.create_app_launch_context(
    params.timestamp,
    params.workspace
  );

  return launchContext;
}

const QwantSearchProvider = new Lang.Class({
  Name: 'QwantSearchProvider',

  _init : () => {
    this.id = 'qwant-search';
    this.appInfo = {
      get_name : () => {
        return _("Recherche Qwant");
      },
      get_icon : () => {
        return Gio.icon_new_for_string(
          Me.path + "/icons/qwant_logo.png"
        );
      },
      get_id : () => {
        return this.id;
      }
    };
    this.qwantResults = new Map();
  },

  _getResultSet: (terms) => {
    logDebug("getResultSet");
    const resultIds = Array.from(this.qwantResults.keys())
    logDebug("found " + resultIds.length + " results" );
    return resultIds;
  },

  getResultMetas: (resultIds, callback) => {
    logDebug("result metas for name: "+resultIds.join(" "));
    const metas = resultIds.map(id => this.getResultMeta(id));
    logDebug("metas: " + metas.join(" "));
    callback(metas);
  },

  getResultMeta: (resultId) => {
    const result = this.qwantResults.get(resultId);
    const name = result.name;
    const description = result.description;
    logDebug("result meta for name: "+result.name);
    logDebug("result meta: ", resultId);
    return {
      'id': resultId,
      'name': name,
      'description': description,
      'createIcon' : function(size) {}
    }
  },

  processTerms: (terms, callback, cancellable, isSearch, category) => {
    this.qwantResults.clear();
    const joined = terms.join(" ");
    let url = null;
    let description = null;
    let original = ["web", "news", "social", "images", "videos", "shopping", "music", "qwant", "junior", "edu", "lite"]
    let translations = [_("Web"), _("Actualités"), _("Social"), _("Images"), _("Vidéos"), _("Shopping"), _("Musique"), _("Qwant"), _("Qwant Junior"), _("Qwant Edu"), _("Qwant Lite")]
    logDebug(preferences.get_string("search-engine"));
    if (isSearch) {
      description = _("Continuer sur {engine} {category}");
      url = (searchUrl.replace('{category}', category)) + encodeURIComponent(joined) + "#";
    } else {
      description = _("Rechercher \"{terms}\" avec Qwant");
      url = searchUrl + encodeURIComponent(joined) + "#";
    }
    this.qwantResults.set(
      url,
      makeResult(
        _(description)
          .replace("{terms}", joined)
          .replace("{category}", translations[original.indexOf(category)])
          .replace("{engine}", translations[original.indexOf(preferences.get_string("search-engine"))]),
        " ",
        () => {},
        url
      )
    );
    logDebug("ProcessTerms: " + joined);
    if (isSearch) {
      this.getSearchResults(terms, callback);
    }
    else {
      if (preferences.get_boolean('activate-suggestions')) {
        this.getSuggestions(terms, callback, category);
      } else {
        callback(this._getResultSet(terms));
      }
    }
  },

  getSuggestions: (terms, callback) => {
    const joined = terms.join(" ");
    let suggestions = {};
    const request = Soup.form_request_new_from_hash(
      'GET',
      suggestionsUrl,
      {'q': joined, 'lang': qwantLocale}
    );
    logDebug("getSuggestions: " + joined)

    if (currentRequest != null) {
      logDebug("Previous request found, canceling");
      _httpSession.cancel_message(currentRequest, 600);
    }

    logDebug("Setting currentRequest for future use");
    currentRequest = request;

    _httpSession.queue_message(request, Lang.bind(this,
      function (_httpSession, response) {
        logDebug("Statuscode: " + response.status_code);
        if (response.status_code === 200) {
          const json = JSON.parse(response.response_body.data);
          const jsonItems = json.data.items;
          const jsonSpecial = json.data.special;
          logDebug("bodydata", response.response_body.data);
          const parsedItems = jsonItems
          .filter(suggestion => suggestion.value != joined)
          .map(suggestion => {
            if (suggestion.value.startsWith("&")) {
              return {
                type: "special",
                name: suggestion.value,
                description: suggestion.site_name,
                url: searchUrl + encodeURIComponent(suggestion.value)
              };
            }
            else {
              return {
                type: "suggestion",
                name: suggestion.value,
                url: searchUrl + encodeURIComponent(suggestion.value)
              };
            }
          });
          const parsedSpecial = jsonSpecial
          .filter(suggestion => suggestion.value != joined)
          .map(suggestion => (
            {
              type: "special",
              name: (suggestion.name + " (" + suggestion.type +")"),
              description: suggestion.description,
              url: searchUrl + encodeURIComponent(suggestion.name)
            }
          ));
          suggestions = parsedSpecial.concat(parsedItems);
          logDebug("Array: " + JSON.stringify(suggestions));
        }
        else {
          if (suggestion != 600) {
            logDebug("No internet or request failed, cannot get suggestions");
            suggestions = [{
              type: "special",
              name: _("Erreur"),
              description: _("Veuillez vérifier votre connexion Internet ou réessayer plus tard"),
              url: " "
            }];
            logDebug("Array: " + JSON.stringify(suggestions));
          }
        }
        currentRequest = null;
        logDebug("Displaying suggestions");
        this.displaySuggestions(suggestions, callback, terms, false);
      })
    );

  },

  getSearchResults: (terms, callback, category) => {
    const joined = terms.join(" ");
    let results = {};
    const request = Soup.form_request_new_from_hash(
      'GET',
      requestUrl.replace('{category}', category),
      {'q': joined, 'lang': qwantLocale, 't': category, 'uiv': '4'}
    );
    logDebug("getSearchResults: " + joined);

    if (currentRequest != null) {
      logDebug("Previous request found, canceling");
      _httpSession.cancel_message(currentRequest, 600);
    }

    logDebug("Setting currentRequest for future use");
    currentRequest = request;

    _httpSession.queue_message(request, Lang.bind(this,
      (_httpSession, response) => {
        logDebug("Statuscode: " + response.status_code);
        if (response.status_code === 200) {
          const json = JSON.parse(response.response_body.data);
          const jsonItems = json.data.items;
          logDebug("bodydata", response.response_body.data);
          const parsedItems = jsonItems
          .filter(results => result.value != joined)
          .map(result => {
            return {
              type: "special",
              name: suggestion.value,
              description: suggestion.url,
              url: suggestion.url,
            };
          });
          results = parsedItems
          logDebug("Array: " + JSON.stringify(results));
        }
        else {
          logDebug("No internet or request failed, cannot get suggestions");
          results = [{
            type: "special",
            name: _("Erreur"),
            description: _("Veuillez vérifier votre connexion Internet ou réessayer plus tard"),
            url: " "
          }];
          logDebug("Array: " + JSON.stringify(results));
        }
        currentRequest = null;
        logDebug("Displaying suggestions");
        this.displaySuggestions(results, callback, terms, true);
      })
    );
  },

  displaySuggestions: (suggestions, callback, terms, isSearch) => {
    if ((preferences.get_int('max-suggestions') != 0) && (isSearch == false)) {
      suggestions.splice(preferences.get_int("max-suggestions"), (suggestions.length - preferences.get_int("max-suggestions")));
    }

    suggestions.forEach(suggestion => {
      if (suggestion.type == "suggestion") {
        this.qwantResults.set(
          suggestion.url,
          makeResult(
            " ",
            suggestion.name,
            function () {},
            suggestion.url
          )
        );
      }
      if (suggestion.type == "special") {
        this.qwantResults.set(
          suggestion.url,
          makeResult(
            suggestion.name,
            suggestion.description,
            function () {},
            suggestion.url
          )
        );
      }
    });
    callback(this._getResultSet(terms));
  },

  activateResult: (resultId, terms) => {
    const result = this.qwantResults[resultId];
    logDebug("activateResult: " + resultId);
    const url = resultId;
    logDebug("url: " + url)
    Gio.app_info_launch_default_for_uri(
      url.replace("{category}", preferences.get_string('category')),
      makeLaunchContext({})
    );
  },

  launchSearch: (result) => {
    logDebug("launchSearch: " + result.name);
    Gio.app_info_launch_default_for_uri(
      "https://www.qwant.com/",
      makeLaunchContext({})
    );
  },

  getInitialResultSet: (terms, callback, cancellable) => {
    logDebug("getInitialResultSet: " + terms.join(" "));
    searchUrl = searchUrlMap[preferences.get_string("search-engine")];
    suggestionsUrl = suggestionsUrlMap[preferences.get_string("search-engine")];
    requestUrl = requestUrlMap[preferences.get_string("search-engine")];
    let categories = ["web-shortcut", "news-shortcut", "social-shortcut", "images-shortcut", "shopping-shortcut", "videos-shortcut", "music-shortcut"]
    let isSearch = false;
    let category = null;
    let editTerms = terms;
    logDebug("Testing for keywords");
    for (let i = 0; i < categories.length; i++) {
      let keyword = preferences.get_string(categories[i]);
      logDebug("Current keyword : " + keyword + " and current term to match : " + terms.slice(0, keyword.split(" ").length));
      if (preferences.get_boolean('disable-shortcuts') == false) {
        if ((keyword != "") && (keyword == terms.slice(0, keyword.split(" ").length).join(" ")) && (terms.slice((keyword.split(" ").length), terms.length) != "")) {
          logDebug("Found, doing search")
          isSearch = true;
          category = categories[i].replace('-shortcut', '');
          editTerms = terms.slice((keyword.split(" ").length), terms.length)
        }
      }
    }

    let shortcut = preferences.get_string('suggest-shortcut');
    if ((shortcut != "") && (shortcut == terms.slice(0, shortcut.split(" ").length).join(" "))) {
      editTerms = terms.slice((shortcut.split(" ").length), terms.length)
    }

    if (isSearch == false) {
      logDebug("Is not a search, checking suggest keyword")
      if (shortcut == "") {
        logDebug("Keyword is empty")
        this.processTerms(editTerms, callback, cancellable, isSearch, category);
      } else {
        logDebug("Matching suggest keyword with terms")
        if (shortcut == terms.slice(0, shortcut.split(" ").length).join(" ")) {
          logDebug("Suggest keyword matches")
          if (editTerms != "") {
            this.processTerms(editTerms, callback, cancellable, isSearch, category);
          }
        } else {
          logDebug("Suggest keyword does not match")
        }
      }
    } else {
      logDebug("Is a search, ignoring suggest keyword")
      this.processTerms(editTerms, callback, cancellable, isSearch, category);
    }
  },

  filterResults: (results, maxResults) => {
    logDebug("filterResults", results, maxResults);
    return results.slice(0, maxResults);
    //return results;
  },

  getSubsearchResultSet: (previousResults, terms, callback, cancellable) => {
    logDebug("getSubSearchResultSet: " + terms.join(" "));
    this.getInitialResultSet(terms, callback, cancellable, );
  },
});

function _openQwant() {
  logDebug("Lauched Qwant from button");
  Gio.app_info_launch_default_for_uri(
    "https://www.qwant.com/",
    makeLaunchContext({})
  );
}

function init(extensionMeta) {
  button = new St.Bin({style_class: 'panel-button',
  reactive: true,
  can_focus: true,
  x_fill: true,
  y_fill: false,
  track_hover: true});
  baseGIcon = Gio.icon_new_for_string(
    Me.path + "/icons/system_status_icon.png"
  );
  hoverGIcon = Gio.icon_new_for_string(
    Me.path + "/icons/qwant_logo.png"
  );
  buttonIcon = new St.Icon({
    'gicon': Gio.icon_new_for_string(
      Me.path + "/icons/system_status_icon.png"
    ),
    'style_class': 'system-status-icon'
  });

  button.set_child(buttonIcon);
  button.connect(
    'button-release-event',
    Lang.bind(this, _openQwant)
  );
  button.connect(
    'enter-event',
    () => {
      _SetButtonIcon('hover');
    }
  );
  button.connect(
    'leave-event',
    function(){
      _SetButtonIcon('base');
    }
  );
}

function enable() {
  logDebug("enable Qwant search provider");
  if (!qwantSearchProvider) {
    logDebug("enable Qwant search provider");
    qwantSearchProvider = new QwantSearchProvider();
    Main.overview.viewSelector._searchResults._registerProvider(
      qwantSearchProvider
    );
  }
  if (preferences.get_boolean('panel-button'))
    Main.panel._rightBox.insert_child_at_index(button, 0);
}

function disable() {
  if (qwantSearchProvider) {
    logDebug("disenable Qwant search provider");
    Main.overview.viewSelector._searchResults._unregisterProvider(
      qwantSearchProvider
    );
    qwantSearchProvider = null;
  }
  Main.panel._rightBox.remove_child(button);
}

function _SetButtonIcon(mode) {
  if (mode === 'hover') {
    buttonIcon.set_gicon(hoverGIcon);
  } else {
    buttonIcon.set_gicon(baseGIcon);
  }
}
