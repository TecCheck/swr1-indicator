/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = 'swr1-indicator';
const LOG_TAG = "[SWR1 Indicator]"

const Clutter = imports.gi.Clutter;
const { GObject, St, Soup, GLib, Gio } = imports.gi;
const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;

var swrExtensionActive = false

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, _('SWR1 Indicator'));

        // Menu
        let item1 = new PopupMenu.PopupMenuItem(_('Livestream')/*, "camera-web"*/);
        item1.connect('activate', () => {
            Main.notify(_('TODO'));
        });
        let item2 = new PopupMenu.PopupMenuItem(_('Website')/*, "network-workgroup"*/);
        item2.connect('activate', () => {
            openUrlInBrowser('https://www.swr.de/swr1/bw/uebersicht-swr1-bw-100.html')
        });

        this.menu.addMenuItem(item1);
        this.menu.addMenuItem(item2);

        // Main indicator box
        this._box = new St.BoxLayout({ 
            style_class: 'panel-status-indicators-box' 
        });
        this._box.add_style_class_name('swr1-indicator-box');
        this.add_child(this._box);

        // Indicator icon
        this._icon = new St.Icon({
            icon_name: 'audio-headphones',
            style_class: 'system-status-icon',
        })
        this._icon.add_style_class_name('swr1-indicator-icon');
        this._box.add_child(this._icon);

        // Indicator text
        this.updateLabel("Läd...");

        // Requests
        this.rest_auth = "Basic c3dyMS1hbmRyb2lkLXY2LXByb2Q6RDU5YmlLS3hjVE9xZm5wd1k3YVVmM2NJMDNTM0tOQTR1OXNsTGZGOHZscz0="
        this.fetchData();
    }

    openUrlInBrowser(url) {
        Gio.app_info_launch_default_for_uri_async(url, null, null, null)
    }

    fetchData() {
        if (!swrExtensionActive)
            return

        var promise = this.loadJsonAsync("https://api.lab.swr.de/radiohub/v2/track/list/swr1bw")
        promise.then(json => this.onDataFetched(json))
            .catch(error => this.onDataFetchError(error));
    }

    loadJsonAsync(url) {
        // Got this function from https://gitlab.com/skrewball/openweather/-/blob/master/src/openweathermap.js
        // and modified it

        return new Promise((resolve, reject) => {
            let _userAgent = Me.metadata.uuid;
            if (Me.metadata.version !== undefined && Me.metadata.version.toString().trim() !== '') {
                _userAgent += '/';
                _userAgent += Me.metadata.version.toString();
            }
    
            let _httpSession = Soup.Session.new();
            _httpSession.user_agent = _userAgent + ' ';

            let _message = Soup.Message.new('GET', url);
            _message.request_headers.append("Authorization", this.rest_auth);
    
            _httpSession.send_and_read_async(_message, GLib.PRIORITY_DEFAULT, null, (_httpSession, _message) => {
                let _jsonString = _httpSession.send_and_read_finish(_message).get_data();
                if (_jsonString instanceof Uint8Array) {
                    _jsonString = ByteArray.toString(_jsonString);
                }
                try {
                    if (!_jsonString) {
                        throw new Error("No data in response body");
                    }
                    resolve(JSON.parse(_jsonString));
                }
                catch (e) {
                    _httpSession.abort();
                    reject(e);
                }
            });
        });
    }

    onDataFetched(json) {
        console.log(LOG_TAG, "Data fetched" /*, json*/);
        let nowMs = Date.now();

        var i = 0;
        while(i < json.data.length) {
            var song = json.data[i];

            if (song.playedAtMs < nowMs) {
                var label = song.displayTitle;
                if (song.displayArtist.length > 0)
                    label = label + " - " + song.displayArtist

                this.updateIcon(song.type);
                this.updateLabel(label);
                this.sheduleNextFetch(song);
                break;
            }
            
            i++;
        }
    }

    onDataFetchError(error) {
        console.error(LOG_TAG, "Data fetch error:\n", error);
    }

    updateIcon(type) {
        switch(type) {
            case SwrContentType.Music: this._icon.set_icon_name("audio-headphones"); break;
            case SwrContentType.News: this._icon.set_icon_name("help-about"); break;
            case SwrContentType.Weather: this._icon.set_icon_name("weather-clear"); break;
            case SwrContentType.Traffic: this._icon.set_icon_name("kt-speed-limits"); break;
            case SwrContentType.Voice: this._icon.set_icon_name("audio-input-microphone"); break;
            default: this._icon.set_icon_name("audio-headphones");
        }
    }

    updateLabel(label) {
        if (label) {
            if (!this._label || !this._labelBin) {
                this._labelBin = new St.Bin({
                    y_align: Clutter.ActorAlign.CENTER,
                });
                this._label = new St.Label();
                this._labelBin.add_actor(this._label);
                this._box.add_actor(this._labelBin);
            }

            this._label.set_text(label);
            if (!this._box.contains(this._labelBin))
                this._box.add_actor(this._labelBin); // FIXME: why is it suddenly necessary?
        
            } else if (this._label) {
            this._labelBin.destroy_all_children();
            this._box.remove_actor(this._labelBin);
            this._labelBin.destroy();
            delete this._labelBin;
            delete this._label;
        }
    }

    sheduleNextFetch(song) {
        console.log(LOG_TAG, "Sheduling next fetch");

        let nowMs = Date.now();
        let predictedSongEnd = song.playedAtMs + song.durationPlan;
        let predictedSongTimeLeft = predictedSongEnd - nowMs;

        var timeUntilNextRequest = predictedSongTimeLeft;

        if (song.type != SwrContentType.Music) {
            timeUntilNextRequest = 5000;
        } else if (timeUntilNextRequest < 3000) {
            timeUntilNextRequest = 3000
            console.log(LOG_TAG, song);
        } else if (timeUntilNextRequest < 10000) {
            timeUntilNextRequest = 10000
        }

        console.log(LOG_TAG, "Time until next request: ", timeUntilNextRequest);
        setTimeout(() => this.fetchData(), timeUntilNextRequest);
    }
});

const SwrContentType = {
    Music: 'music',
    News: 'news',
    Weather: 'weather',
    Traffic: 'traffic',
    Voice: 'voice'
};

class Extension {
    constructor(uuid) {
        this._uuid = uuid;
        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        swrExtensionActive = true;

        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this._uuid, this._indicator);
    }

    disable() {
        swrExtensionActive = false;

        this._indicator.destroy();
        this._indicator = null;
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
