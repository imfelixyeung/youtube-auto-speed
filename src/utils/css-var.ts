export const cssVar = (container: string | HTMLElement, variable: string) => {
    const $container =
        container instanceof HTMLElement
            ? container
            : document.querySelector(container);
    if (!$container) {
        return "";
    }
    return getComputedStyle($container).getPropertyValue(variable);
};
