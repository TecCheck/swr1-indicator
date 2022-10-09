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
const { GObject, St, Soup, GLib } = imports.gi;
const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('SWR1 Indicator'));

        this._box = new St.BoxLayout({ 
            style_class: 'panel-status-indicators-box' 
        });
        this._box.add_style_class_name('appindicator-box');
        this.add_child(this._box);

        this._icon = new St.Icon({
            icon_name: 'audio-headphones',
            style_class: 'system-status-icon',
        })
        this._icon.add_style_class_name('appindicator-icon');
        this._icon.add_style_class_name('status-notifier-icon');
        this._icon.set_style('padding:0');
        this._box.add_child(this._icon);

        this.updateLabel("Läd...");

        this.rest_auth = "Basic c3dyMS1hbmRyb2lkLXY2LXByb2Q6RDU5YmlLS3hjVE9xZm5wd1k3YVVmM2NJMDNTM0tOQTR1OXNsTGZGOHZscz0="
        this.fetchData();
    }

    fetchData() {
        var promise = this.loadJsonAsync("https://api.lab.swr.de/radiohub/v2/track/list/swr1bw")
        promise.then(json => this.onDataFetched(json))
        promise.catch(error => this.onDataFetchError(error))
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
        let label = json.data[0].displayTitle + " - " + json.data[0].displayArtist;
        this.updateLabel(label); 
    }

    onDataFetchError(error) {
        console.error(LOG_TAG, "Data fetch error:\n", error);
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
});

class Extension {
    constructor(uuid) {
        this._uuid = uuid;
        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this._uuid, this._indicator);

        console.log(LOG_TAG, "Soup: ", Soup.get_major_version());
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
