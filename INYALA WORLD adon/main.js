(function (Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error("INYALA WORLD TurboWarp Addon doit être chargé en mode non sécurisé.");
    }

    if (window.__INYALA_WORLD_ADDON_LOADED__) {
        return;
    }

    window.__INYALA_WORLD_ADDON_LOADED__ = true;

    const ADDON_ID = "inyalaWorldAddon";
    const STORAGE_KEY = "INYALA_WORLD_ADDON_DEVICE_SETTINGS";

    /* =========================================================
       DONNÉES
    ========================================================= */

    const deviceSettings = {
        compactMode: false,
        animations: true,
        showDescriptions: true,
        interfaceScale: 100
    };

    const projectState = {
        version: 1,
        modules: {}
    };

    const modules = new Map();

    let rootElement = null;
    let buttonElement = null;
    let panelElement = null;
    let activePage = "modules";
    let searchText = "";

    /* =========================================================
       UTILITAIRES
    ========================================================= */

    function safeJSONParse(text, fallback) {
        try {
            return JSON.parse(text);
        } catch (error) {
            return fallback;
        }
    }

    function loadDeviceSettings() {
        const saved = safeJSONParse(
            localStorage.getItem(STORAGE_KEY),
            {}
        );

        Object.assign(deviceSettings, saved);
    }

    function saveDeviceSettings() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(deviceSettings)
            );
        } catch (error) {
            console.warn(
                "[INYALA WORLD Addon] Impossible de sauvegarder les paramètres appareil.",
                error
            );
        }
    }

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getAccentColor() {
        const style = getComputedStyle(document.documentElement);

        const possibleVariables = [
            "--accent-color",
            "--ui-primary",
            "--primary-color",
            "--color-primary"
        ];

        for (const variable of possibleVariables) {
            const value = style
                .getPropertyValue(variable)
                .trim();

            if (value) {
                return value;
            }
        }

        return "#7c3aed";
    }

    function isDarkTheme() {
        const body = document.body;

        return (
            document.documentElement.classList.contains("dark") ||
            body.classList.contains("dark") ||
            document.documentElement.dataset.theme === "dark"
        );
    }

    function getModuleState(moduleId) {
        if (!projectState.modules[moduleId]) {
            projectState.modules[moduleId] = {
                enabled: false,
                permissions: {}
            };
        }

        return projectState.modules[moduleId];
    }

    function setModuleEnabled(moduleId, enabled) {
        const state = getModuleState(moduleId);

        state.enabled = Boolean(enabled);

        const module = modules.get(moduleId);

        if (module) {
            if (state.enabled) {
                if (typeof module.onEnable === "function") {
                    try {
                        module.onEnable();
                    } catch (error) {
                        console.error(
                            "[INYALA WORLD Addon] Erreur activation module:",
                            moduleId,
                            error
                        );
                    }
                }
            } else {
                if (typeof module.onDisable === "function") {
                    try {
                        module.onDisable();
                    } catch (error) {
                        console.error(
                            "[INYALA WORLD Addon] Erreur désactivation module:",
                            moduleId,
                            error
                        );
                    }
                }
            }
        }

        saveProjectState();

        renderContent();
    }

    function setPermission(moduleId, permission, value) {
        const state = getModuleState(moduleId);

        state.permissions[permission] = Boolean(value);

        saveProjectState();
    }

    function hasPermission(moduleId, permission) {
        const state = getModuleState(moduleId);

        return state.permissions[permission] === true;
    }

    /* =========================================================
       ÉTAT DU PROJET
    ========================================================= */

    function getProjectState() {
        return JSON.parse(
            JSON.stringify(projectState)
        );
    }

    function loadProjectState(data) {
        if (!data || typeof data !== "object") {
            return;
        }

        if (!data.modules || typeof data.modules !== "object") {
            return;
        }

        projectState.version =
            Number(data.version) || 1;

        projectState.modules = data.modules;

        for (const [moduleId, module] of modules) {
            const state = getModuleState(moduleId);

            if (state.enabled && typeof module.onEnable === "function") {
                try {
                    module.onEnable();
                } catch (error) {
                    console.error(error);
                }
            }
        }

        renderContent();
    }

    function saveProjectState() {
        /*
         * Cette fonction prépare l'état à sauvegarder.
         *
         * TurboWarp ne fournit pas une API publique universelle
         * pour ajouter directement des données personnalisées
         * dans chaque fichier SB3 depuis une extension.
         *
         * Les futurs modules pourront donc utiliser :
         *
         * window.INYALA_WORLD_ADDON.getProjectState()
         *
         * et le système principal pourra ensuite être relié
         * à ton propre système de sauvegarde du projet.
         */

        window.dispatchEvent(
            new CustomEvent("inyala-world-project-state-change", {
                detail: getProjectState()
            })
        );
    }

    /* =========================================================
       API MODULES
    ========================================================= */

    function registerModule(moduleDefinition) {
        if (
            !moduleDefinition ||
            typeof moduleDefinition !== "object"
        ) {
            throw new Error("Module invalide.");
        }

        if (
            !moduleDefinition.id ||
            typeof moduleDefinition.id !== "string"
        ) {
            throw new Error("Le module doit posséder un id.");
        }

        if (modules.has(moduleDefinition.id)) {
            console.warn(
                "[INYALA WORLD Addon] Module déjà enregistré:",
                moduleDefinition.id
            );

            return false;
        }

        const normalizedModule = {
            id: moduleDefinition.id,
            name:
                moduleDefinition.name ||
                moduleDefinition.id,

            description:
                moduleDefinition.description || "",

            icon:
                moduleDefinition.icon || "★",

            version:
                moduleDefinition.version || "1.0.0",

            permissions:
                Array.isArray(moduleDefinition.permissions)
                    ? moduleDefinition.permissions
                    : [],

            onEnable:
                typeof moduleDefinition.onEnable === "function"
                    ? moduleDefinition.onEnable
                    : null,

            onDisable:
                typeof moduleDefinition.onDisable === "function"
                    ? moduleDefinition.onDisable
                    : null,

            onLoad:
                typeof moduleDefinition.onLoad === "function"
                    ? moduleDefinition.onLoad
                    : null
        };

        modules.set(
            normalizedModule.id,
            normalizedModule
        );

        getModuleState(normalizedModule.id);

        if (normalizedModule.onLoad) {
            try {
                normalizedModule.onLoad();
            } catch (error) {
                console.error(
                    "[INYALA WORLD Addon] Erreur chargement module:",
                    normalizedModule.id,
                    error
                );
            }
        }

        renderContent();

        return true;
    }

    function unregisterModule(moduleId) {
        const module = modules.get(moduleId);

        if (!module) {
            return false;
        }

        const state = getModuleState(moduleId);

        if (
            state.enabled &&
            typeof module.onDisable === "function"
        ) {
            try {
                module.onDisable();
            } catch (error) {
                console.error(error);
            }
        }

        modules.delete(moduleId);

        renderContent();

        return true;
    }

    /* =========================================================
       INTERFACE
    ========================================================= */

    function injectStyles() {
        if (
            document.getElementById(
                "inyala-world-addon-style"
            )
        ) {
            return;
        }

        const style = document.createElement("style");

        style.id = "inyala-world-addon-style";

        style.textContent = `
            #inyala-world-addon-button {
                position: relative;
                min-width: 34px;
                height: 34px;
                border: 0;
                border-radius: 6px;
                cursor: pointer;
                font-size: 17px;
                line-height: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
            }

            #inyala-world-addon-button i {
                font-style: normal;
                font-size: 17px;
                line-height: 1;
            }

            #inyala-world-addon-panel {
                position: fixed;
                top: 72px;
                right: 16px;
                width: min(470px, calc(100vw - 32px));
                height: min(640px, calc(100vh - 90px));
                z-index: 2147483000;
                display: none;
                overflow: hidden;
                border-radius: 12px;
                box-shadow: 0 14px 45px rgba(0, 0, 0, .35);
                box-sizing: border-box;
                font-family: Arial, sans-serif;
            }

            #inyala-world-addon-panel * {
                box-sizing: border-box;
            }

            .inyala-world-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 10px 12px;
                cursor: move;
                user-select: none;
            }

            .inyala-world-title {
                font-weight: bold;
                font-size: 14px;
            }

            .inyala-world-close {
                border: 0;
                background: transparent;
                color: inherit;
                font-size: 21px;
                cursor: pointer;
                width: 30px;
                height: 30px;
            }

            .inyala-world-tabs {
                display: flex;
                border-bottom: 1px solid rgba(127,127,127,.25);
            }

            .inyala-world-tab {
                flex: 1;
                padding: 9px 4px;
                border: 0;
                background: transparent;
                color: inherit;
                cursor: pointer;
                font-size: 12px;
            }

            .inyala-world-content {
                height: calc(100% - 94px);
                overflow: auto;
                padding: 12px;
            }

            .inyala-world-search {
                width: 100%;
                padding: 9px 10px;
                border-radius: 7px;
                margin-bottom: 10px;
                font-size: 13px;
            }

            .inyala-world-empty {
                text-align: center;
                padding: 40px 15px;
                opacity: .7;
            }

            .inyala-world-module {
                padding: 10px;
                margin-bottom: 8px;
                border-radius: 9px;
                border: 1px solid rgba(127,127,127,.2);
            }

            .inyala-world-module-top {
                display: flex;
                gap: 9px;
                align-items: center;
            }

            .inyala-world-module-icon {
                width: 34px;
                height: 34px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 17px;
                flex-shrink: 0;
            }

            .inyala-world-module-name {
                font-weight: bold;
                font-size: 13px;
            }

            .inyala-world-module-description {
                margin-top: 3px;
                font-size: 11px;
                opacity: .7;
            }

            .inyala-world-module-bottom {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 9px;
            }

            .inyala-world-toggle {
                padding: 6px 9px;
                border-radius: 6px;
                border: 0;
                cursor: pointer;
                font-size: 11px;
            }

            .inyala-world-setting {
                margin-bottom: 14px;
            }

            .inyala-world-setting label {
                display: block;
                margin-bottom: 5px;
                font-size: 13px;
            }

            .inyala-world-setting input,
            .inyala-world-setting select {
                width: 100%;
            }

            .inyala-world-switch-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 12px;
            }
        `;

        document.head.appendChild(style);
    }

    function getColors() {
        const dark = isDarkTheme();

        return {
            background: dark ? "#17191f" : "#ffffff",
            secondary: dark ? "#20232c" : "#f2f3f6",
            text: dark ? "#f5f5f5" : "#202124",
            muted: dark ? "#aeb2bc" : "#5f6368",
            border: dark ? "#343842" : "#d8dce2",
            accent: getAccentColor()
        };
    }

    function applyTheme() {
        if (!panelElement) {
            return;
        }

        const colors = getColors();

        panelElement.style.background =
            colors.background;

        panelElement.style.color =
            colors.text;

        panelElement.style.border =
            "1px solid " + colors.border;

        const header =
            panelElement.querySelector(
                ".inyala-world-header"
            );

        if (header) {
            header.style.background =
                colors.secondary;
        }

        if (buttonElement) {
            buttonElement.style.background =
                colors.accent;

            buttonElement.style.color = "#ffffff";
        }
    }

    function createPanel() {
        if (panelElement) {
            return;
        }

        panelElement =
            document.createElement("div");

        panelElement.id =
            "inyala-world-addon-panel";

        panelElement.innerHTML = `
            <div class="inyala-world-header"
                 id="inyala-world-drag-handle">

                <div class="inyala-world-title">
                    ★ INYALA WORLD TurboWarp Addon
                </div>

                <button
                    class="inyala-world-close"
                    id="inyala-world-close"
                    aria-label="Fermer"
                >
                    ×
                </button>
            </div>

            <div class="inyala-world-tabs">

                <button
                    class="inyala-world-tab"
                    data-page="modules"
                >
                    ★ Modules
                </button>

                <button
                    class="inyala-world-tab"
                    data-page="settings"
                >
                    ⚙ Paramètres
                </button>

            </div>

            <div
                class="inyala-world-content"
                id="inyala-world-content"
            ></div>
        `;

        document.body.appendChild(panelElement);

        panelElement
            .querySelector("#inyala-world-close")
            .addEventListener("click", closePanel);

        panelElement
            .querySelectorAll("[data-page]")
            .forEach(button => {
                button.addEventListener(
                    "click",
                    () => {
                        activePage =
                            button.dataset.page;

                        renderContent();
                    }
                );
            });

        makeDraggable(
            panelElement,
            panelElement.querySelector(
                "#inyala-world-drag-handle"
            )
        );

        applyTheme();
    }

    function renderModulesPage() {
        const content =
            panelElement.querySelector(
                "#inyala-world-content"
            );

        const filteredModules =
            [...modules.values()].filter(module => {
                const text =
                    (
                        module.name +
                        " " +
                        module.description
                    ).toLowerCase();

                return text.includes(
                    searchText.toLowerCase()
                );
            });

        content.innerHTML = `
            <input
                id="inyala-world-search"
                class="inyala-world-search"
                type="search"
                placeholder="Rechercher un module..."
                value="${escapeHTML(searchText)}"
            >

            <div id="inyala-world-module-list"></div>
        `;

        const search =
            content.querySelector(
                "#inyala-world-search"
            );

        search.addEventListener("input", event => {
            searchText = event.target.value;
            renderModulesPage();
        });

        const list =
            content.querySelector(
                "#inyala-world-module-list"
            );

        if (filteredModules.length === 0) {
            list.innerHTML = `
                <div class="inyala-world-empty">
                    ★<br><br>
                    Aucun module disponible.<br>
                    Les modules apparaîtront ici lorsqu'ils seront ajoutés.
                </div>
            `;

            return;
        }

        filteredModules.forEach(module => {
            const state =
                getModuleState(module.id);

            const colors = getColors();

            const element =
                document.createElement("div");

            element.className =
                "inyala-world-module";

            element.innerHTML = `
                <div class="inyala-world-module-top">

                    <div
                        class="inyala-world-module-icon"
                        style="
                            background:${colors.accent}22;
                            color:${colors.accent};
                        "
                    >
                        ${escapeHTML(module.icon)}
                    </div>

                    <div>

                        <div
                            class="inyala-world-module-name"
                        >
                            ${escapeHTML(module.name)}
                        </div>

                        <div
                            class="inyala-world-module-description"
                        >
                            ${escapeHTML(
                                module.description
                            )}
                        </div>

                    </div>

                </div>

                <div class="inyala-world-module-bottom">

                    <small>
                        v${escapeHTML(module.version)}
                    </small>

                    <button
                        class="inyala-world-toggle"
                        data-module-id="${escapeHTML(module.id)}"
                    >
                        ${
                            state.enabled
                                ? "Désactiver"
                                : "Activer"
                        }
                    </button>

                </div>
            `;

            const toggle =
                element.querySelector(
                    ".inyala-world-toggle"
                );

            toggle.style.background =
                state.enabled
                    ? "#d9534f"
                    : colors.accent;

            toggle.style.color = "#ffffff";

            toggle.addEventListener(
                "click",
                () => {
                    setModuleEnabled(
                        module.id,
                        !state.enabled
                    );
                }
            );

            list.appendChild(element);
        });
    }

    function renderSettingsPage() {
        const content =
            panelElement.querySelector(
                "#inyala-world-content"
            );

        content.innerHTML = `
            <div class="inyala-world-setting">

                <label>
                    Échelle de l'interface :
                    ${deviceSettings.interfaceScale}%
                </label>

                <input
                    id="inyala-world-scale"
                    type="range"
                    min="70"
                    max="130"
                    value="${deviceSettings.interfaceScale}"
                >

            </div>

            <div class="inyala-world-switch-row">

                <span>Mode compact</span>

                <input
                    id="inyala-world-compact"
                    type="checkbox"
                    ${
                        deviceSettings.compactMode
                            ? "checked"
                            : ""
                    }
                >

            </div>

            <div class="inyala-world-switch-row">

                <span>Animations</span>

                <input
                    id="inyala-world-animations"
                    type="checkbox"
                    ${
                        deviceSettings.animations
                            ? "checked"
                            : ""
                    }
                >

            </div>

            <div class="inyala-world-switch-row">

                <span>Afficher les descriptions</span>

                <input
                    id="inyala-world-descriptions"
                    type="checkbox"
                    ${
                        deviceSettings.showDescriptions
                            ? "checked"
                            : ""
                    }
                >

            </div>

            <div style="margin-top:25px;opacity:.65;font-size:11px;">
                Ces paramètres sont enregistrés sur cet appareil.
                L'état et les autorisations des modules sont prévus
                pour être associés au projet.
            </div>
        `;

        content
            .querySelector("#inyala-world-scale")
            .addEventListener("input", event => {
                deviceSettings.interfaceScale =
                    Number(event.target.value);

                panelElement.style.transform =
                    `scale(${deviceSettings.interfaceScale / 100})`;

                panelElement.style.transformOrigin =
                    "top right";

                saveDeviceSettings();

                renderSettingsPage();
            });

        content
            .querySelector("#inyala-world-compact")
            .addEventListener("change", event => {
                deviceSettings.compactMode =
                    event.target.checked;

                saveDeviceSettings();
            });

        content
            .querySelector("#inyala-world-animations")
            .addEventListener("change", event => {
                deviceSettings.animations =
                    event.target.checked;

                saveDeviceSettings();
            });

        content
            .querySelector("#inyala-world-descriptions")
            .addEventListener("change", event => {
                deviceSettings.showDescriptions =
                    event.target.checked;

                saveDeviceSettings();
            });
    }

    function renderContent() {
        if (
            !panelElement ||
            panelElement.style.display === "none"
        ) {
            return;
        }

        applyTheme();

        if (activePage === "modules") {
            renderModulesPage();
        }

        if (activePage === "settings") {
            renderSettingsPage();
        }
    }

    function openPanel() {
        createPanel();

        panelElement.style.display = "block";

        applyTheme();
        renderContent();
    }

    function closePanel() {
        if (!panelElement) {
            return;
        }

        panelElement.style.display = "none";
    }

    function togglePanel() {
        if (
            !panelElement ||
            panelElement.style.display === "none"
        ) {
            openPanel();
        } else {
            closePanel();
        }
    }

    /* =========================================================
       BOUTON TURBOWARP
    ========================================================= */

    function findTurboWarpToolbar() {
        const selectors = [
            "[class*='controls']",
            "[class*='Controls']",
            "[class*='stage-header']",
            "[class*='stageHeader']"
        ];

        for (const selector of selectors) {
            const elements =
                document.querySelectorAll(selector);

            for (const element of elements) {
                const buttons =
                    element.querySelectorAll("button");

                if (buttons.length >= 2) {
                    return element;
                }
            }
        }

        return null;
    }

    function injectButton() {
        if (
            buttonElement &&
            document.contains(buttonElement)
        ) {
            return true;
        }

        const toolbar =
            findTurboWarpToolbar();

        if (!toolbar) {
            return false;
        }

        buttonElement =
            document.createElement("button");

        buttonElement.id =
            "inyala-world-addon-button";

        buttonElement.type = "button";

        buttonElement.title =
            "INYALA WORLD TurboWarp Addon";

        buttonElement.innerHTML =
            "<i>★</i>";

        buttonElement.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();
                togglePanel();
            }
        );

        toolbar.appendChild(buttonElement);

        applyTheme();

        return true;
    }

    function watchToolbar() {
        injectButton();

        const observer =
            new MutationObserver(() => {
                injectButton();

                if (panelElement) {
                    applyTheme();
                }
            });

        observer.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    "class",
                    "data-theme",
                    "style"
                ]
            }
        );
    }

    /* =========================================================
       PANNEAU DÉPLAÇABLE
    ========================================================= */

    function makeDraggable(element, handle) {
        let dragging = false;

        let startX = 0;
        let startY = 0;

        let startLeft = 0;
        let startTop = 0;

        handle.addEventListener(
            "pointerdown",
            event => {
                if (
                    event.target.closest("button")
                ) {
                    return;
                }

                const rect =
                    element.getBoundingClientRect();

                dragging = true;

                startX = event.clientX;
                startY = event.clientY;

                startLeft = rect.left;
                startTop = rect.top;

                element.style.right = "auto";

                try {
                    handle.setPointerCapture(
                        event.pointerId
                    );
                } catch (error) {}
            }
        );

        handle.addEventListener(
            "pointermove",
            event => {
                if (!dragging) {
                    return;
                }

                element.style.left =
                    (
                        startLeft +
                        event.clientX -
                        startX
                    ) + "px";

                element.style.top =
                    (
                        startTop +
                        event.clientY -
                        startY
                    ) + "px";
            }
        );

        handle.addEventListener(
            "pointerup",
            () => {
                dragging = false;
            }
        );

        handle.addEventListener(
            "pointercancel",
            () => {
                dragging = false;
            }
        );
    }

    /* =========================================================
       API PUBLIQUE
    ========================================================= */

    window.INYALA_WORLD_ADDON = {
        version: "1.0.0",

        registerModule,

        unregisterModule,

        getModules() {
            return [...modules.values()].map(module => ({
                id: module.id,
                name: module.name,
                description: module.description,
                version: module.version,
                enabled:
                    getModuleState(module.id).enabled
            }));
        },

        isModuleEnabled(moduleId) {
            return getModuleState(moduleId).enabled;
        },

        enableModule(moduleId) {
            setModuleEnabled(moduleId, true);
        },

        disableModule(moduleId) {
            setModuleEnabled(moduleId, false);
        },

        setPermission,

        hasPermission,

        getProjectState,

        loadProjectState,

        getDeviceSettings() {
            return {
                ...deviceSettings
            };
        },

        open() {
            openPanel();
        },

        close() {
            closePanel();
        },

        refresh() {
            applyTheme();
            renderContent();
        }
    };

    /* =========================================================
       EXTENSION TURBOWARP
    ========================================================= */

    class InyalaWorldAddonExtension {
        getInfo() {
            return {
                id: ADDON_ID,

                name:
                    "INYALA WORLD TurboWarp Addon",

                color1: "#7c3aed",

                blocks: [
                    {
                        opcode: "openAddon",
                        blockType:
                            Scratch.BlockType.COMMAND,

                        text:
                            "ouvrir INYALA WORLD Addon"
                    },

                    {
                        opcode: "moduleEnabled",

                        blockType:
                            Scratch.BlockType.BOOLEAN,

                        text:
                            "module [MODULE] activé ?",

                        arguments: {
                            MODULE: {
                                type:
                                    Scratch.ArgumentType.STRING,

                                defaultValue:
                                    "module-id"
                            }
                        }
                    }
                ]
            };
        }

        openAddon() {
            openPanel();
        }

        moduleEnabled(args) {
            return getModuleState(
                String(args.MODULE)
            ).enabled;
        }
    }

    /* =========================================================
       DÉMARRAGE
    ========================================================= */

    loadDeviceSettings();

    injectStyles();

    watchToolbar();

    setInterval(() => {
        injectButton();

        if (panelElement) {
            applyTheme();
        }
    }, 1500);

    Scratch.extensions.register(
        new InyalaWorldAddonExtension()
    );

})(Scratch);
