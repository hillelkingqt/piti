
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
import json
import sys
import io
# Force stdout to use UTF-8 encoding to handle Unicode paths correctly, especially on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


import matplotlib
import os
import ast

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    RTL_SUPPORT_ENABLED = True
except ImportError:
    RTL_SUPPORT_ENABLED = False
    sys.stderr.write("Warning: 'arabic_reshaper' or 'python-bidi' module not found. RTL text might not render correctly.\n")

HEBREW_FONT_CANDIDATES = ['Arial', 'David Libre', 'David', 'Miriam', 'DejaVu Sans', 'Noto Sans Hebrew', 'Frank Ruhl Hofshi', 'Calibri']
effective_font_family = 'sans-serif'

def find_system_font(font_names_list):
    available_fonts = {f.name.lower() for f in fm.fontManager.ttflist}
    for font_name in font_names_list:
        if font_name.lower() in available_fonts:
            sys.stderr.write(f"Found preferred font: {font_name}\n")
            return font_name
    sys.stderr.write(f"Could not find any of {font_names_list}. Using Matplotlib default.\n")
    return 'sans-serif'

def safe_eval_expr(expr_str, local_vars=None):
    # ... (same as your last version) ...
    if local_vars is None:
        local_vars = {}
    allowed_np_members = {"sin", "cos", "tan", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "exp", "log", "log10", "sqrt", "abs", "power", "rad2deg", "deg2rad", "linspace", "arange", "array", "floor", "ceil", "round", "pi", "e"}
    evaluation_scope = {"np": np, **local_vars}
    node = ast.parse(expr_str, mode='eval')
    for sub_node in ast.walk(node):
        if isinstance(sub_node, ast.Name):
            if sub_node.id not in evaluation_scope and sub_node.id not in allowed_np_members:
                if sub_node.id == "pi": evaluation_scope["pi"] = np.pi
                elif sub_node.id == "e": evaluation_scope["e"] = np.e
                else: raise NameError(f"Name '{sub_node.id}' is not allowed directly. Use np.{sub_node.id} or ensure it's a defined variable.")
        elif isinstance(sub_node, ast.Call):
            func_node = sub_node.func
            if isinstance(func_node, ast.Name):
                if func_node.id not in evaluation_scope and func_node.id not in allowed_np_members: raise NameError(f"Function call '{func_node.id}' is not allowed.")
            elif isinstance(func_node, ast.Attribute):
                if isinstance(func_node.value, ast.Name):
                    obj_name, method_name = func_node.value.id, func_node.attr
                    if obj_name == "np" and method_name not in allowed_np_members: raise NameError(f"NumPy function 'np.{method_name}' is not allowed.")
                    elif obj_name in local_vars and method_name not in ['min', 'max', 'mean', 'std', 'sum', 'shape', 'size', 'dtype', 'copy', 'tolist']: raise AttributeError(f"Method call '{obj_name}.{method_name}' on a local variable is not allowed.")
                    elif obj_name not in local_vars and obj_name != "np": raise NameError(f"Object '{obj_name}' for method call '{obj_name}.{method_name}' is not allowed.")
        elif not isinstance(sub_node, (ast.Expression, ast.Name, ast.Constant, ast.BinOp, ast.UnaryOp, ast.Compare, ast.IfExp, ast.Tuple, ast.List, ast.Load, ast.Attribute, ast.Subscript, ast.Index, ast.Slice, ast.Mult, ast.Add, ast.Sub, ast.Div, ast.Pow, ast.USub, ast.UAdd, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.And, ast.Or, ast.Call)):
            if sys.version_info < (3, 8) and isinstance(sub_node, ast.Num): pass
            else: raise SyntaxError(f"AST node type {type(sub_node).__name__} is not allowed.")
    return eval(compile(node, '<string>', 'eval'), {"__builtins__": {}}, evaluation_scope)


def format_rtl_text(text):
    if not text: return ""
    if RTL_SUPPORT_ENABLED:
        try:
            if not isinstance(text, str): text = str(text)
            reshaped_text = arabic_reshaper.reshape(text)
            bidi_text = get_display(reshaped_text)
            return bidi_text
        except Exception as e:
            sys.stderr.write(f"Warning: Error during RTL text processing for '{text}': {str(e)}. Returning original text.\n")
            return text
    return text

# --- Plotting function for graphs (remains largely the same) ---
def plot_graph_functions(data, ax, font_props): # Added font_props
    # ... (your existing plot_graph function, but ensure it uses font_props for text elements)
    # Example changes:
    # ax.set_title(format_rtl_text(data.get("title", ...)), ..., fontproperties=font_props)
    # ax.set_xlabel(format_rtl_text(data.get("x_label", ...)), ..., fontproperties=font_props)
    # ... and so on for all text elements in plot_graph_functions
    plotted_functions_y_vals = []
    x_global_range_defined = "x_range" in data and len(data["x_range"]) == 2
    global_x_min, global_x_max = data.get("x_range", [-10, 10]) if x_global_range_defined else (None, None)

    for func_data in data.get("functions", []):
        func_str = func_data.get("expression")
        if not func_str:
            sys.stderr.write("Warning: Skipping function with no expression.\n")
            plotted_functions_y_vals.append(None)
            continue
        label = format_rtl_text(func_data.get("label", func_str))
        color = func_data.get("color")
        linestyle = func_data.get("linestyle", "-")
        linewidth = float(func_data.get("linewidth", 1.5))
        x_min_func = func_data.get("x_min", global_x_min if global_x_min is not None else -10)
        x_max_func = func_data.get("x_max", global_x_max if global_x_max is not None else 10)
        num_points = int(func_data.get("points", 500))
        x_vals_func = np.linspace(x_min_func, x_max_func, num_points)
        y_vals_str_py = func_str.replace('^', '**')
        try:
            current_y_vals = safe_eval_expr(y_vals_str_py, {"x": x_vals_func})
            ax.plot(x_vals_func, current_y_vals, label=label, color=color, linestyle=linestyle, linewidth=linewidth, zorder=3)
            plotted_functions_y_vals.append(current_y_vals)
        except Exception as e:
            sys.stderr.write(f"Error evaluating/plotting function '{func_str}': {str(e)}\n")
            plotted_functions_y_vals.append(None)
    # Title and labels (these are now common, might move to main plot_controller)
    ax.set_title(format_rtl_text(data.get("title", "Generated Graph")), fontsize=data.get("title_fontsize", 16), fontproperties=font_props)
    ax.set_xlabel(format_rtl_text(data.get("x_label", "x")), fontsize=data.get("xlabel_fontsize", 12), fontproperties=font_props)
    ax.set_ylabel(format_rtl_text(data.get("y_label", "y")), fontsize=data.get("ylabel_fontsize", 12), fontproperties=font_props)

    if "x_axis_range" in data and len(data["x_axis_range"]) == 2: ax.set_xlim(data["x_axis_range"])
    if "y_axis_range" in data and len(data["y_axis_range"]) == 2: ax.set_ylim(data["y_axis_range"])
    if data.get("grid", True): ax.grid(True, which=data.get("grid_which", 'both'), linestyle=data.get("grid_linestyle", '--'), linewidth=float(data.get("grid_linewidth", 0.7)), zorder=1)
    current_xlim, current_ylim = ax.get_xlim(), ax.get_ylim()
    axis_color = data.get("axis_color", 'black' if plt.style.library[data.get("style", "seaborn-v0_8-darkgrid")]['axes.facecolor'] != 'black' else 'lightgray')
    axis_lw, axis_zorder = float(data.get("axis_linewidth", 1.0)), float(data.get("axis_zorder", 2))
    if current_xlim[0] <= 0 <= current_xlim[1]: ax.axvline(0, color=axis_color, linewidth=axis_lw, zorder=axis_zorder)
    if current_ylim[0] <= 0 <= current_ylim[1]: ax.axhline(0, color=axis_color, linewidth=axis_lw, zorder=axis_zorder)

    if data.get("x_ticks_pi_rad", False):
        x_lim_for_ticks = ax.get_xlim()
        num_pi_halves = int(np.floor(x_lim_for_ticks[1] / (np.pi/2))) - int(np.ceil(x_lim_for_ticks[0] / (np.pi/2))) +1
        start_multiple = np.ceil(x_lim_for_ticks[0] / (np.pi/2))
        pi_multiples_vals = np.arange(start_multiple, start_multiple + num_pi_halves) * (np.pi / 2)
        pi_multiples_vals = pi_multiples_vals[(pi_multiples_vals >= x_lim_for_ticks[0]) & (pi_multiples_vals <= x_lim_for_ticks[1])]
        pi_labels = []
        for m_val in pi_multiples_vals:
            multiple_of_pi = m_val / np.pi
            if np.isclose(m_val, 0): pi_labels.append('0')
            elif np.isclose(multiple_of_pi, int(multiple_of_pi)): pi_labels.append(format_rtl_text(f'{int(multiple_of_pi)}π' if int(multiple_of_pi) != 1 else 'π'))
            else:
                from fractions import Fraction
                frac = Fraction(multiple_of_pi).limit_denominator(4)
                if frac.denominator == 1: pi_labels.append(format_rtl_text(f'{frac.numerator}π'))
                elif frac.numerator == 1: pi_labels.append(format_rtl_text(f'π/{frac.denominator}'))
                elif frac.numerator == -1: pi_labels.append(format_rtl_text(f'-π/{frac.denominator}'))
                else: pi_labels.append(format_rtl_text(f'{frac.numerator}π/{frac.denominator}'))
        ax.set_xticks(pi_multiples_vals)
        ax.set_xticklabels(pi_labels, fontproperties=font_props)
    if data.get("legend", True) and any(f.get("label") for f in data.get("functions", [])): ax.legend(fontsize=data.get("legend_fontsize", 10), loc=data.get("legend_loc", "best"), prop=font_props)
    for ann in data.get("annotations", []):
        text, xy, xytext, arrowprops = format_rtl_text(ann.get("text")), tuple(ann.get("xy", [0,0])), tuple(ann.get("xytext", [ann.get("xy",[0,0])[0]+1, ann.get("xy",[0,0])[1]+1] if len(ann.get("xy",[0,0]))==2 else [1,1])), ann.get("arrowprops")
        if text: ax.annotate(text, xy=xy, xytext=xytext, arrowprops=arrowprops if arrowprops else dict(arrowstyle="->", connectionstyle="arc3"), fontsize=int(ann.get("fontsize", 10)), zorder=4, fontproperties=font_props)
    for vline_data in data.get("vertical_lines", []):
        if "x" in vline_data: ax.axvline(vline_data["x"], color=vline_data.get("color", "gray"), linestyle=vline_data.get("linestyle", "--"), label=format_rtl_text(vline_data.get("label")), linewidth=float(vline_data.get("linewidth", 1.2)), zorder=2.5)
    for hline_data in data.get("horizontal_lines", []):
        if "y" in hline_data: ax.axhline(hline_data["y"], color=hline_data.get("color", "gray"), linestyle=hline_data.get("linestyle", "--"), label=format_rtl_text(hline_data.get("label")), linewidth=float(vline_data.get("linewidth", 1.2)), zorder=2.5)
    for label_obj in ax.get_xticklabels() + ax.get_yticklabels(): label_obj.set_fontproperties(font_props)
    for fill_data in data.get("fill_between", []):
        idx1, idx2 = fill_data.get("function1_index"), fill_data.get("function2_index")
        if idx1 is not None and 0 <= idx1 < len(data.get("functions", [])):
            func1_meta = data["functions"][idx1]
            x_fill_min, x_fill_max = fill_data.get("x_min", func1_meta.get("x_min", global_x_min if global_x_min is not None else -10)), fill_data.get("x_max", func1_meta.get("x_max", global_x_max if global_x_max is not None else 10))
            x_fill_vals = np.linspace(x_fill_min, x_fill_max, int(fill_data.get("points", 200)))
            y1_fill = safe_eval_expr(func1_meta["expression"].replace('^', '**'), {"x": x_fill_vals})
            y2_fill = np.zeros_like(x_fill_vals)
            if idx2 is not None and 0 <= idx2 < len(data.get("functions", [])): y2_fill = safe_eval_expr(data["functions"][idx2]["expression"].replace('^', '**'), {"x": x_fill_vals})
            elif idx2 is not None: sys.stderr.write(f"Warning: function2_index {idx2} out of bounds for fill_between. Filling to x-axis.\n")
            where_condition_str, where_eval = fill_data.get("where_condition"), None
            if where_condition_str:
                try: where_eval = safe_eval_expr(where_condition_str, {"y1": y1_fill, "y2": y2_fill, "x": x_fill_vals})
                except Exception as e_where: sys.stderr.write(f"Error evaluating 'where_condition' for fill_between: {str(e_where)}\n")
            ax.fill_between(x_fill_vals, y1_fill, y2_fill, color=fill_data.get("color", "skyblue"), alpha=float(fill_data.get("alpha", 0.4)), where=where_eval, label=format_rtl_text(fill_data.get("label")), zorder=2)
        else: sys.stderr.write(f"Warning: Invalid function1_index ({idx1}) for fill_between.\n")

# --- Plotting function for simple tables ---
def plot_table(data, ax, font_props):
    table_data = data.get("table_data", [["No Data"]])
    if not table_data:
        ax.text(0.5, 0.5, format_rtl_text("אין נתונים להצגה בטבלה"), ha='center', va='center', fontsize=12, fontproperties=font_props)
        ax.axis('off')
        return

    # Format all cell data for RTL
    formatted_table_data = [[format_rtl_text(cell) for cell in row] for row in table_data]

    col_widths = data.get("table_col_widths")
    # Create table - Matplotlib tables are a bit fiddly
    # We hide the axes as the table itself is the plot
    ax.axis('tight')
    ax.axis('off')
    the_table = ax.table(cellText=formatted_table_data,
                         colWidths=col_widths,
                         cellLoc=data.get("table_cell_loc", 'center'),
                         loc='center')

    the_table.auto_set_font_size(False)
    # Set font properties for all cells
    for key, cell in the_table.get_celld().items():
        cell.set_text_props(fontproperties=font_props)
        # Optionally, make header bold, etc.
        if key[0] == 0 : # Header row
             cell.set_text_props(weight='bold', fontproperties=font_props)
             cell.set_facecolor(data.get("table_header_color", "#DDDDDD")) # Light gray for header

    ax.set_title(format_rtl_text(data.get("title", "Table")), fontsize=data.get("title_fontsize", 16), fontproperties=font_props, pad=20)


# --- Plotting function for pie charts ---
def plot_pie_chart(data, ax, font_props):
    labels = [format_rtl_text(l) for l in data.get("pie_labels", [])]
    sizes = data.get("pie_sizes", [])
    if not labels or not sizes or len(labels) != len(sizes):
        ax.text(0.5, 0.5, format_rtl_text("נתונים חסרים או לא תואמים לתרשים עוגה"), ha='center', va='center', fontproperties=font_props)
        ax.axis('off')
        return

    explode = data.get("pie_explode")
    if explode and len(explode) != len(labels): explode = None # Validate explode length
    colors = data.get("pie_colors")

    # Use textprops to apply font to percentage labels inside pie
    wedges, texts, autotexts = ax.pie(sizes, explode=explode, labels=labels, colors=colors,
                                      autopct=data.get("pie_autopct"), shadow=data.get("pie_shadow", False),
                                      startangle=data.get("pie_startangle", 0),
                                      textprops={'fontproperties': font_props}) # Apply to labels
    for autotext in autotexts: # Apply to autopct text
        autotext.set_fontproperties(font_props)

    ax.axis('equal')  # Equal aspect ratio ensures that pie is drawn as a circle.
    ax.set_title(format_rtl_text(data.get("title", "Pie Chart")), fontsize=data.get("title_fontsize", 16), fontproperties=font_props)
    if data.get("legend", False) and labels: # Optional legend for pie if many slices
         ax.legend(wedges, labels, title=format_rtl_text(data.get("legend_title", "מקרא")), loc="center left", bbox_to_anchor=(1, 0, 0.5, 1), prop=font_props)


# --- Plotting function for bar charts ---
def plot_bar_chart(data, ax, font_props, horizontal=False):
    categories = [format_rtl_text(c) for c in data.get("bar_categories", [])]
    values = data.get("bar_values", [])
    if not categories or not values or len(categories) != len(values):
        ax.text(0.5, 0.5, format_rtl_text("נתונים חסרים או לא תואמים לתרשים עמודות"), ha='center', va='center', fontproperties=font_props)
        return

    errors = data.get("bar_errors")
    colors = data.get("bar_colors")
    bar_width = float(data.get("bar_width", 0.6)) if not horizontal else float(data.get("bar_height", 0.6)) # Height for hbar
    bar_label = format_rtl_text(data.get("bar_label"))

    if horizontal:
        ax.barh(categories, values, xerr=errors, color=colors, height=bar_width, label=bar_label, zorder=3)
        ax.set_xlabel(format_rtl_text(data.get("bar_x_label", "ערך")), fontproperties=font_props)
        ax.set_ylabel(format_rtl_text(data.get("bar_y_label", "קטגוריה")), fontproperties=font_props)
        ax.invert_yaxis() # labels read top-to-bottom
    else:
        ax.bar(categories, values, yerr=errors, color=colors, width=bar_width, label=bar_label, zorder=3)
        ax.set_xlabel(format_rtl_text(data.get("bar_x_label", "קטגוריה")), fontproperties=font_props)
        ax.set_ylabel(format_rtl_text(data.get("bar_y_label", "ערך")), fontproperties=font_props)

    ax.set_title(format_rtl_text(data.get("title", "Bar Chart")), fontsize=data.get("title_fontsize", 16), fontproperties=font_props)
    if data.get("grid", True): ax.grid(axis='y' if not horizontal else 'x', linestyle='--', zorder=0)
    if bar_label and data.get("legend", False): ax.legend(prop=font_props)
    ax.tick_params(axis='x', labelrotation=data.get("bar_xtick_rotation", 0)) # Rotate x-axis labels if needed

# --- Plotting function for scatter plots ---
def plot_scatter_plot(data, ax, font_props):
    x_values = data.get("scatter_x_values", [])
    y_values = data.get("scatter_y_values", [])
    if not x_values or not y_values or len(x_values) != len(y_values):
        ax.text(0.5,0.5, format_rtl_text("נתונים חסרים או לא תואמים לתרשים פיזור"), ha='center', va='center', fontproperties=font_props); return

    sizes = data.get("scatter_sizes")
    colors = data.get("scatter_colors", "blue")
    alpha = float(data.get("scatter_alpha", 0.7))
    marker = data.get("scatter_marker", "o")

    ax.scatter(x_values, y_values, s=sizes, c=colors, alpha=alpha, marker=marker, zorder=3)
    ax.set_title(format_rtl_text(data.get("title", "Scatter Plot")), fontproperties=font_props)
    ax.set_xlabel(format_rtl_text(data.get("scatter_x_label", "X")), fontproperties=font_props)
    ax.set_ylabel(format_rtl_text(data.get("scatter_y_label", "Y")), fontproperties=font_props)
    if data.get("grid", True): ax.grid(True, linestyle='--', zorder=0)

# --- Plotting function for histograms ---
def plot_histogram(data, ax, font_props):
    data_series = data.get("hist_data_series", [])
    if not data_series:
        ax.text(0.5,0.5, format_rtl_text("סדרת נתונים חסרה להיסטוגרמה"), ha='center', va='center', fontproperties=font_props); return

    bins = data.get("hist_bins", 10) # Can be int or sequence
    color = data.get("hist_color", "skyblue")
    edgecolor = data.get("hist_edgecolor", "black")

    ax.hist(data_series, bins=bins, color=color, edgecolor=edgecolor, zorder=3)
    ax.set_title(format_rtl_text(data.get("title", "Histogram")), fontproperties=font_props)
    ax.set_xlabel(format_rtl_text(data.get("hist_x_label", "Values")), fontproperties=font_props)
    ax.set_ylabel(format_rtl_text(data.get("hist_y_label", "Frequency")), fontproperties=font_props)
    if data.get("grid", True): ax.grid(axis='y', linestyle='--', zorder=0)


# --- Plotting function for heatmaps ---
def plot_heatmap(data, ax, font_props):
    heatmap_data = np.array(data.get("heatmap_data", []))
    if heatmap_data.ndim != 2 or heatmap_data.size == 0:
        ax.text(0.5,0.5, format_rtl_text("נתונים חסרים או לא תקינים לטבלת חום (נדרשת מטריצה דו-ממדית)"), ha='center', va='center', fontproperties=font_props); return

    row_labels = [format_rtl_text(l) for l in data.get("heatmap_row_labels", [])]
    col_labels = [format_rtl_text(l) for l in data.get("heatmap_col_labels", [])]
    cmap = data.get("heatmap_cmap", "viridis")
    show_values = data.get("heatmap_show_values", True)

    im = ax.imshow(heatmap_data, cmap=cmap)

    # Set ticks and labels
    if col_labels and len(col_labels) == heatmap_data.shape[1]:
        ax.set_xticks(np.arange(heatmap_data.shape[1]))
        ax.set_xticklabels(col_labels, fontproperties=font_props, rotation=data.get("heatmap_xtick_rotation", 45), ha="right")
    if row_labels and len(row_labels) == heatmap_data.shape[0]:
        ax.set_yticks(np.arange(heatmap_data.shape[0]))
        ax.set_yticklabels(row_labels, fontproperties=font_props)

    # Add text annotations for values if requested
    if show_values:
        for i in range(heatmap_data.shape[0]):
            for j in range(heatmap_data.shape[1]):
                text_val = heatmap_data[i, j]
                # Format if float, else keep as is (could be string from AI)
                text_to_display = f"{text_val:.1f}" if isinstance(text_val, float) else str(text_val)
                ax.text(j, i, format_rtl_text(text_to_display),
                        ha="center", va="center", color=data.get("heatmap_value_color", "w"), fontproperties=font_props)

    fig = ax.figure
    fig.colorbar(im, ax=ax, label=format_rtl_text(data.get("heatmap_cbar_label", "ערך")))
    ax.set_title(format_rtl_text(data.get("title", "Heatmap")), fontproperties=font_props)


# --- Plotting function for line chart from data ---
def plot_line_from_data(data, ax, font_props):
    x_values = data.get("line_x_values", [])
    y_values = data.get("line_y_values", [])
    if not x_values or not y_values or len(x_values) != len(y_values):
        ax.text(0.5,0.5, format_rtl_text("נתונים חסרים או לא תואמים לגרף קווי"), ha='center', va='center', fontproperties=font_props); return

    color = data.get("line_color", "purple")
    marker = data.get("line_marker")
    linestyle = data.get("line_linestyle", "-")
    linewidth = float(data.get("line_linewidth", 1.5))
    label = format_rtl_text(data.get("line_label"))

    ax.plot(x_values, y_values, color=color, marker=marker, linestyle=linestyle, linewidth=linewidth, label=label, zorder=3)
    ax.set_title(format_rtl_text(data.get("title", "Line Chart")), fontproperties=font_props)
    ax.set_xlabel(format_rtl_text(data.get("line_x_label", "X")), fontproperties=font_props)
    ax.set_ylabel(format_rtl_text(data.get("line_y_label", "Y")), fontproperties=font_props)
    if data.get("grid", True): ax.grid(True, linestyle='--', zorder=0)
    if label and data.get("legend", False): ax.legend(prop=font_props)


# --- Main controller function ---
def plot_controller(data):
    global effective_font_family
    try:
        user_font = data.get("font_family")
        if user_font:
            effective_font_family = user_font
            sys.stderr.write(f"User specified font: {user_font}\n")
        else:
            effective_font_family = find_system_font(HEBREW_FONT_CANDIDATES)
        plt.rcParams['font.family'] = effective_font_family
        font_props = fm.FontProperties(family=effective_font_family)

        plt.style.use(data.get("style", "seaborn-v0_8-darkgrid")) # Default style
        fig, ax = plt.subplots(figsize=tuple(data.get("figsize", [10, 6]))) # Default figsize

        chart_type = data.get("table_chart_type", "table") # Default to simple table

        if chart_type == "function_graph": # Kept the old name for compatibility if JSON still uses it
             plot_graph_functions(data, ax, font_props) # This is your original graph plotting
        elif chart_type == "table":
            plot_table(data, ax, font_props)
        elif chart_type == "pie":
            plot_pie_chart(data, ax, font_props)
        elif chart_type == "bar":
            plot_bar_chart(data, ax, font_props, horizontal=False)
        elif chart_type == "hbar":
            plot_bar_chart(data, ax, font_props, horizontal=True)
        elif chart_type == "scatter":
            plot_scatter_plot(data, ax, font_props)
        elif chart_type == "histogram":
            plot_histogram(data, ax, font_props)
        elif chart_type == "heatmap":
            plot_heatmap(data, ax, font_props)
        elif chart_type == "line_from_data":
            plot_line_from_data(data, ax, font_props)
        else:
            ax.text(0.5, 0.5, format_rtl_text(f"סוג תרשים לא נתמך: {chart_type}"), ha='center', va='center', fontproperties=font_props)
            sys.stderr.write(f"Error: Unsupported table_chart_type: {chart_type}\n")

        # Common elements like title, labels are now handled within specific plot functions
        # or could be set here if they are truly global for all chart types.

        output_path = data.get("output_path", "plot_output.png")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        plt.savefig(output_path, dpi=int(data.get("dpi", 150)), bbox_inches='tight')
        plt.close(fig)
        return output_path

    except Exception as e:
        import traceback
        sys.stderr.write(f"Critical error in plot_controller for type '{data.get('table_chart_type')}': {str(e)}\n")
        sys.stderr.write(traceback.format_exc() + "\n")
        return None


if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_json_path = sys.argv[1]
        try:
            with open(input_json_path, 'r', encoding='utf-8') as f:
                plot_data_input = json.load(f)
        except Exception as e:
            sys.stderr.write(f"Error reading or parsing JSON input file '{input_json_path}': {str(e)}\n")
            sys.exit(1)
    else:
        try:
            input_str_stdin = sys.stdin.read()
            if not input_str_stdin:
                sys.stderr.write("Error: No input data provided to Python script via stdin or file.\n")
                sys.exit(1)
            plot_data_input = json.loads(input_str_stdin)
        except json.JSONDecodeError as e:
            sys.stderr.write(f"Error decoding JSON from stdin: {str(e)}\nReceived (first 500 chars): {input_str_stdin[:500]}\n")
            sys.exit(1)
        except Exception as e:
            sys.stderr.write(f"Generic error reading from stdin: {str(e)}\n")
            sys.exit(1)

    # Rename plot_graph to plot_controller or similar if it's now a generic controller
    # For now, assuming the JSON from Node.js still uses "action": "generate_graph"
    # but contains "table_chart_type" to distinguish.
    if plot_data_input.get("action") == "generate_graph" and "functions" in plot_data_input :
         # This is likely an old-style function graph request
         plot_data_input["table_chart_type"] = "function_graph" # Set type for controller

    generated_image_path = plot_controller(plot_data_input)

    if generated_image_path:
        print(generated_image_path)
    else:
        sys.exit(1)