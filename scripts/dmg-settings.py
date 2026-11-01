# dmgbuild settings: window layout of the installer. Run through scripts/make-dmg.sh.
import os
app = defines['app']
appname = os.path.basename(app)

format = 'UDZO'
files = [app]
symlinks = {'Applications': '/Applications'}
icon = defines.get('icon')              # volume icon
background = defines['bg']              # HiDPI tiff made by scripts/make-dmg-bg.js

show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
default_view = 'icon-view'
window_rect = ((200, 140), (660, 400))  # content size = background size
icon_size = 128
text_size = 13
icon_locations = {appname: (180, 190), 'Applications': (480, 190)}
