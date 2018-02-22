# Qwant-Gnome-shell-integration
A Gnome-shell extension to be able to search Qwant directly from the overview (still under developement)
Only for Gnome 3.26+

Features : 
 - Get suggestions and search Qwant directly from the Overview.
 - Special suggestions and Qwicks (access or search directly from websites using "&")
 - Adds a button to the top panel to launch Qwant directly

Screenshot:
![Screenshot](Qwant_search@alex.nitters.eu/Screen.png)

To come:
 - Results preview (Web, news, social) (may be a separate extension)
 - If you have other ideas, contact me at alex@nitters.eu
 
 How to install:
 ```
 git clone https://github.com/al34034/Qwant-Gnome-shell-integration/ ~/Downloads/git_temp/
 cp ~/Downloads/git_temp/Qwant_search@alex.nitters.eu/ ~/.local/share/gnome-shell/extensions/Qwant_search@alex.nitters.eu/
 rm -rf ~/Downloads/git_temp/
 gnome-shell-extension-tool -e Qwant_search@alex.nitters.eu
 ```
 Restart gnome-shell : Alt+F2 and type "r"
 
 Uninstall:
 ```
 gnome-shell-extension-tool -d Qwant_search@alex.nitters.eu
 rm -rf ~/.local/share/gnome-shell/extensions/Qwant_search@alex.nitters.eu/
 ```
